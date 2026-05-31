import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { computeCheckout } from '@omnipos/core';
import type { Province } from '@omnipos/core';
import type { TenderType } from '@omnipos/db';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipsService } from '../memberships/memberships.service';
import { StripeService } from '../stripe/stripe.service';
import { CouponsService } from '../coupons/coupons.service';
import { ProductsService } from '../products/products.service';
import type { CheckoutDto } from './dto/checkout.dto';

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly memberships: MembershipsService,
    private readonly stripe: StripeService,
    private readonly coupons: CouponsService,
    private readonly products: ProductsService,
  ) {}

  async getStore(storeId: string) {
    return this.prisma.db.store.findUnique({ where: { id: storeId } });
  }

  /** Preview checkout totals (no DB write — used for the POS display). */
  previewCheckout(dto: CheckoutDto, province: Province) {
    return computeCheckout({
      province,
      tender: dto.tender as TenderType,
      discountCents: dto.discountCents ?? 0,
      tipCents: dto.tipCents ?? 0,
      lines: dto.lines,
    });
  }

  /** Finalise checkout: create invoice, record payments, deduct inventory, update booking. */
  async checkout(bookingId: string, dto: CheckoutDto, tenantId: string) {
    const booking = await this.prisma.db.booking.findUnique({
      where: { id: bookingId },
      include: { store: true, customer: true, lineItems: { include: { catalogItem: true } }, invoice: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.invoice) throw new BadRequestException('Invoice already exists for this booking');

    const province = booking.store.province as Province;

    // Resolve retail product sales → line items (authoritative price) + stock deduction later.
    const productLines: { description: string; amountCents: number; taxable: boolean }[] = [];
    if (dto.productSales?.length) {
      const ids = dto.productSales.map(p => p.productId);
      const products = await this.prisma.db.product.findMany({ where: { id: { in: ids } } });
      for (const sale of dto.productSales) {
        const p = products.find(x => x.id === sale.productId);
        if (!p) continue;
        if (p.stockQty < sale.qty) throw new BadRequestException(`Insufficient stock for ${p.name}`);
        productLines.push({ description: `${p.name}${sale.qty > 1 ? ` ×${sale.qty}` : ''} (retail)`, amountCents: p.priceCents * sale.qty, taxable: true });
      }
    }

    // Member discount (spec §11): tier discount applies to SERVICES only (not retail).
    const serviceSubtotal = dto.lines.reduce((s, l) => s + l.amountCents, 0);
    const allLines = [...dto.lines, ...productLines];
    const memberBenefits = await this.memberships.benefitsFor(booking.customerId, serviceSubtotal);
    const statementCreditRequested = dto.discountCents ?? 0;

    // Coupon discount (feature 5): validate + apply to the service subtotal.
    let couponDiscountCents = 0;
    let appliedCouponCode: string | undefined;
    let appliedCouponId: string | undefined;
    if (dto.couponCode) {
      const result = await this.coupons.validate(dto.couponCode, serviceSubtotal);
      if (!result.valid) throw new BadRequestException(`Coupon: ${result.reason}`);
      couponDiscountCents = result.discountCents ?? 0;
      appliedCouponCode = result.code;
      appliedCouponId = result.couponId;
    }

    const totalDiscount = statementCreditRequested + memberBenefits.discountCents + couponDiscountCents;

    const result = computeCheckout({
      province,
      tender: dto.tender as TenderType,
      discountCents: totalDiscount,
      tipCents: dto.tipCents ?? 0,
      lines: allLines,
    });

    // Deduct statement credit
    if (statementCreditRequested > 0 && booking.customer.statementCreditCents > 0) {
      const deduct = Math.min(statementCreditRequested, booking.customer.statementCreditCents);
      await this.prisma.db.customer.update({
        where: { id: booking.customerId },
        data: { statementCreditCents: { decrement: deduct } },
      });
    }

    // Process Stripe PaymentIntent (card / mobile wallet)
    let stripePaymentIntentId: string | undefined;
    if ((dto.tender === 'CARD' || dto.tender === 'MOBILE_WALLET') && this.stripe.enabled) {
      const pi = await this.stripe.createPaymentIntent({
        amountCents: result.totalCents,
        currency: 'cad',
        stripeCustomerId: booking.customer.stripeCustomerId,
        paymentMethodId: dto.stripePaymentMethodId ?? null,
        metadata: { bookingId, tenantId },
      });
      if (pi) stripePaymentIntentId = pi.id;
    }

    // Create invoice + tax lines + payment record + close booking
    const invoice = await this.prisma.db.invoice.create({
      data: {
        tenantId,
        storeId: booking.storeId,
        bookingId,
        status: 'PAID',
        subtotalCents: result.subtotalCents,
        taxCents: result.totalTaxCents,
        discountCents: result.discountCents,
        couponCode: appliedCouponCode,
        couponDiscountCents,
        tipCents: result.tipCents,
        cashRoundingCents: result.cashRoundingCents,
        totalCents: result.totalCents,
        province,
        lines: {
          create: allLines.map((l) => ({
            tenantId,
            description: l.description,
            amountCents: l.amountCents,
            taxable: l.taxable ?? true,
          })),
        },
        taxLines: {
          create: result.taxes.map((t) => ({
            tenantId,
            component: t.component,
            rate: t.rate,
            amountCents: t.amount,
          })),
        },
        payments: {
          create: [{
            tenantId,
            tender: dto.tender as TenderType,
            amountCents: result.totalCents,
            stripePaymentIntentId,
          }],
        },
      },
      include: { lines: true, taxLines: true, payments: true },
    });

    await this.prisma.db.booking.update({ where: { id: bookingId }, data: { status: 'COMPLETED' } });
    await this.deductInventory(booking.storeId, tenantId);

    // Decrement retail product stock for items sold on this bill
    if (dto.productSales?.length) await this.products.recordSale(dto.productSales);

    // Increment coupon redemption count after a successful checkout
    if (appliedCouponId) await this.coupons.redeem(appliedCouponId);

    const loyalty = await this.memberships.accrueForCheckout(
      booking.customerId,
      result.netTotalCents,
      tenantId,
      bookingId,
    );

    await this.audit.log({
      action: 'CHECKOUT',
      entityType: 'invoice',
      entityId: invoice.id,
      metadata: {
        totalCents: result.totalCents,
        province,
        tender: dto.tender,
        memberTier: memberBenefits.tier,
        pointsEarned: loyalty.earned,
        stripePaymentIntentId,
      },
    });

    return {
      invoice,
      checkout: result,
      member: { tier: memberBenefits.tier, discountCents: memberBenefits.discountCents },
      coupon: appliedCouponCode ? { code: appliedCouponCode, discountCents: couponDiscountCents } : null,
      loyalty,
    };
  }

  private async deductInventory(storeId: string, tenantId: string) {
    const consumables = await this.prisma.db.inventoryItem.findMany({
      where: { storeId, category: 'CONSUMABLE', consumptionPerService: { not: null } },
    });
    for (const item of consumables) {
      await this.prisma.db.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: { decrement: item.consumptionPerService ?? 0 } },
      });
    }
  }

  /** Get saved Stripe card-on-file payment methods for a customer. */
  async getPaymentMethods(customerId: string) {
    const customer = await this.prisma.db.customer.findUnique({ where: { id: customerId } });
    if (!customer?.stripeCustomerId || !this.stripe.enabled) return { methods: [] };
    const list = await this.stripe.client!.paymentMethods.list({
      customer: customer.stripeCustomerId,
      type: 'card',
    });
    return {
      methods: list.data.map(pm => ({
        id: pm.id,
        last4: pm.card?.last4,
        brand: pm.card?.brand,
        expMonth: pm.card?.exp_month,
        expYear: pm.card?.exp_year,
      })),
    };
  }

  /**
   * Generate a Stripe Payment Link for a custom amount.
   * Use case: no-show fees, deposits, balance due — staff sends link to client.
   */
  async createPaymentLink(customerId: string, amountCents: number, description: string) {
    const customer = await this.prisma.db.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    if (!this.stripe.enabled) {
      return { url: null, note: 'Stripe not configured' };
    }

    const stripeCustomerId = await this.stripe.ensureCustomer({
      customerId,
      email: customer.email,
      name: customer.fullName,
      stripeCustomerId: customer.stripeCustomerId,
    });
    if (stripeCustomerId && stripeCustomerId !== customer.stripeCustomerId) {
      await this.prisma.db.customer.update({ where: { id: customerId }, data: { stripeCustomerId } });
    }

    // Create an ad-hoc price + payment link
    const price = await this.stripe.client!.prices.create({
      currency: 'cad',
      unit_amount: amountCents,
      product_data: { name: description || 'OmniPOS charge' },
    });
    const link = await this.stripe.client!.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { customerId, description },
    });
    return { url: link.url, linkId: link.id };
  }

  /**
   * Attach a Stripe test card to a customer (test mode only).
   * Uses predefined Stripe test payment method tokens — no raw card numbers,
   * no PCI scope. For production, replace with Stripe.js SetupIntent flow.
   *
   * Test token map: https://docs.stripe.com/testing?testing-method=payment-methods#cards
   */
  async attachTestCard(customerId: string, testToken: string) {
    const customer = await this.prisma.db.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (!this.stripe.enabled) return { error: 'Stripe not configured' };

    const stripeCustomerId = await this.stripe.ensureCustomer({
      customerId, email: customer.email, name: customer.fullName,
      stripeCustomerId: customer.stripeCustomerId,
    });
    if (stripeCustomerId && stripeCustomerId !== customer.stripeCustomerId) {
      await this.prisma.db.customer.update({ where: { id: customerId }, data: { stripeCustomerId } });
    }

    // Attach the predefined test PM (pm_card_visa, pm_card_mastercard, etc.)
    const pm = await this.stripe.client!.paymentMethods.attach(testToken, { customer: stripeCustomerId! });
    // Set as default for invoices
    await this.stripe.client!.customers.update(stripeCustomerId!, {
      invoice_settings: { default_payment_method: pm.id },
    });
    return { id: pm.id, last4: pm.card?.last4, brand: pm.card?.brand, expMonth: pm.card?.exp_month, expYear: pm.card?.exp_year };
  }

  /** Create a Stripe SetupIntent for card-on-file (booking intake). */
  async createSetupIntent(customerId: string) {
    const customer = await this.prisma.db.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    if (!this.stripe.enabled) {
      return { clientSecret: 'seti_test_placeholder', stripeCustomerId: 'cus_test' };
    }

    // Ensure Stripe customer
    const stripeCustomerId = await this.stripe.ensureCustomer({
      customerId,
      email: customer.email,
      name: customer.fullName,
      stripeCustomerId: customer.stripeCustomerId,
    });

    if (stripeCustomerId && stripeCustomerId !== customer.stripeCustomerId) {
      await this.prisma.db.customer.update({
        where: { id: customerId },
        data: { stripeCustomerId },
      });
    }

    const si = await this.stripe.createSetupIntent(stripeCustomerId!);
    return { clientSecret: si?.clientSecret ?? null, stripeCustomerId };
  }
}

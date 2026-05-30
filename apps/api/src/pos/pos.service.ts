import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { computeCheckout } from '@omnipos/core';
import type { Province } from '@omnipos/core';
import type { TenderType } from '@omnipos/db';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipsService } from '../memberships/memberships.service';
import { StripeService } from '../stripe/stripe.service';
import type { CheckoutDto } from './dto/checkout.dto';

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly memberships: MembershipsService,
    private readonly stripe: StripeService,
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

    // Member discount (spec §11): auto-apply tier discount on top of statement credit.
    const serviceSubtotal = dto.lines.reduce((s, l) => s + l.amountCents, 0);
    const memberBenefits = await this.memberships.benefitsFor(booking.customerId, serviceSubtotal);
    const statementCreditRequested = dto.discountCents ?? 0;
    const totalDiscount = statementCreditRequested + memberBenefits.discountCents;

    const result = computeCheckout({
      province,
      tender: dto.tender as TenderType,
      discountCents: totalDiscount,
      tipCents: dto.tipCents ?? 0,
      lines: dto.lines,
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
        tipCents: result.tipCents,
        cashRoundingCents: result.cashRoundingCents,
        totalCents: result.totalCents,
        province,
        lines: {
          create: dto.lines.map((l) => ({
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

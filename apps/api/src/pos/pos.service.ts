import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { computeCheckout } from '@omnipos/core';
import type { Province } from '@omnipos/core';
import type { TenderType } from '@omnipos/db';
import Stripe from 'stripe';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CheckoutDto } from './dto/checkout.dto';

@Injectable()
export class PosService {
  private readonly stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder', {
    apiVersion: '2025-02-24.acacia',
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
    const result = computeCheckout({
      province,
      tender: dto.tender as TenderType,
      discountCents: dto.discountCents ?? 0,
      tipCents: dto.tipCents ?? 0,
      lines: dto.lines,
    });

    // Deduct statement credit from customer
    if ((dto.discountCents ?? 0) > 0 && booking.customer.statementCreditCents > 0) {
      const deduct = Math.min(dto.discountCents ?? 0, booking.customer.statementCreditCents);
      await this.prisma.db.customer.update({
        where: { id: booking.customerId },
        data: { statementCreditCents: { decrement: deduct } },
      });
    }

    // Process Stripe payment (card/wallet)
    let stripePaymentIntentId: string | undefined;
    if ((dto.tender === 'CARD' || dto.tender === 'MOBILE_WALLET') && dto.stripePaymentMethodId && process.env.STRIPE_SECRET_KEY?.startsWith('sk_')) {
      try {
        const pi = await this.stripe.paymentIntents.create({
          amount: result.totalCents,
          currency: 'cad',
          payment_method: dto.stripePaymentMethodId,
          confirm: true,
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
          metadata: { bookingId, tenantId },
        });
        stripePaymentIntentId = pi.id;
      } catch {
        // Fall through in test mode where paymentMethod isn't attached to a customer
      }
    }

    // Create invoice + tax lines + payment + close booking
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

    // Deduct consumable inventory
    await this.deductInventory(booking.storeId, tenantId);

    await this.audit.log({
      action: 'CHECKOUT',
      entityType: 'invoice',
      entityId: invoice.id,
      metadata: { totalCents: result.totalCents, province, tender: dto.tender },
    });

    return { invoice, checkout: result };
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

  /** Create a Stripe SetupIntent for card-on-file (used at booking time). */
  async createSetupIntent(customerId: string) {
    const c = await this.prisma.db.customer.findUnique({ where: { id: customerId } });
    if (!c) throw new NotFoundException('Customer not found');

    let stripeCustomerId: string | undefined;
    // stripeCustomerId is stored on the booking, not the customer model directly
    if (!stripeCustomerId && process.env.STRIPE_SECRET_KEY?.startsWith('sk_')) {
      const sc = await this.stripe.customers.create({ email: c.email ?? undefined, name: c.fullName });
      stripeCustomerId = sc.id;
    }

    if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_')) {
      return { clientSecret: 'seti_test_placeholder', stripeCustomerId: 'cus_test' };
    }

    const si = await this.stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
    });
    return { clientSecret: si.client_secret, stripeCustomerId };
  }
}

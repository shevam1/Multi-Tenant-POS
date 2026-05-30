import { BadRequestException, Controller, Headers, Logger, Post, RawBodyRequest, Req } from '@nestjs/common';
import type { Request } from 'express';
import Stripe from 'stripe';
import { Public } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from './stripe.service';

/**
 * Handles Stripe webhook events.
 *
 * Events processed:
 * - checkout.session.completed: payment link or Checkout Session paid →
 *   if metadata has customerId, credit the customer's statementCreditCents
 *   (this is the bridge between "generate payment link" → "automatically credited")
 * - payment_intent.succeeded: card-on-file charge succeeded
 */
@Controller('stripe/webhook')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripe: StripeService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post()
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') sig: string,
  ) {
    if (!this.stripe.enabled || !this.stripe.client) return { received: true };

    let event: Stripe.Event;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (webhookSecret && webhookSecret !== 'whsec_placeholder' && req.rawBody) {
      try {
        event = this.stripe.client.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
      } catch {
        throw new BadRequestException('Webhook signature verification failed');
      }
    } else {
      // Dev mode: no secret — trust the payload (ONLY safe in test/dev)
      event = req.body as Stripe.Event;
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
          break;
        case 'payment_intent.succeeded':
          this.logger.log(`PaymentIntent succeeded: ${(event.data.object as Stripe.PaymentIntent).id}`);
          break;
        default:
          this.logger.debug(`Unhandled event type: ${event.type}`);
      }
    } catch (err) {
      this.logger.error('Webhook handler error', err);
    }

    return { received: true };
  }

  private async handleCheckoutComplete(session: Stripe.Checkout.Session) {
    const customerId = session.metadata?.customerId;
    if (!customerId) return;

    // Amount paid in cents (session.amount_total is in smallest currency unit)
    const paidCents = session.amount_total ?? 0;
    if (paidCents <= 0) return;

    // Credit the customer's statement credit balance
    const customer = await this.prisma.asSystem(tx =>
      tx.customer.findUnique({ where: { id: customerId }, select: { id: true, tenantId: true, fullName: true } }),
    );
    if (!customer) {
      this.logger.warn(`Webhook: customerId ${customerId} not found`);
      return;
    }

    await this.prisma.asSystem(tx =>
      tx.customer.update({
        where: { id: customerId },
        data: { statementCreditCents: { increment: paidCents } },
      }),
    );

    this.logger.log(
      `💳 Payment link paid by ${customer.fullName}: +${paidCents} credits applied (session ${session.id})`,
    );
  }
}

import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

/**
 * Thin wrapper around the Stripe SDK.
 * All methods degrade gracefully when STRIPE_SECRET_KEY is a placeholder
 * (returns null / skips), so local dev without a real key still works.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  readonly client: Stripe | null;

  constructor() {
    const key = process.env.STRIPE_SECRET_KEY ?? '';
    this.client = key.startsWith('sk_') ? new Stripe(key, { apiVersion: '2025-02-24.acacia' }) : null;
    if (!this.client) this.logger.warn('STRIPE_SECRET_KEY not set — Stripe features disabled');
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  // ── Customers ────────────────────────────────────────────────────────────

  async ensureCustomer(params: {
    customerId: string;
    email: string | null;
    name: string;
    stripeCustomerId: string | null;
  }): Promise<string | null> {
    if (!this.client) return null;
    if (params.stripeCustomerId) return params.stripeCustomerId;
    const customer = await this.client.customers.create({
      email: params.email ?? undefined,
      name: params.name,
      metadata: { omniposCustomerId: params.customerId },
    });
    return customer.id;
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  async createSubscription(params: {
    stripeCustomerId: string;
    stripePriceId: string;
    trialDays?: number;
    metadata?: Record<string, string>;
  }): Promise<{ subscriptionId: string; status: string; currentPeriodEnd: Date } | null> {
    if (!this.client) return null;
    const sub = await this.client.subscriptions.create({
      customer: params.stripeCustomerId,
      items: [{ price: params.stripePriceId }],
      metadata: params.metadata ?? {},
      // send_invoice: creates an open invoice the customer pays via a hosted link.
      // No card required upfront — ideal for demo and new-member onboarding.
      // Swap to charge_automatically once a payment method is on file.
      collection_method: 'send_invoice',
      days_until_due: 7,
    });
    const raw = sub as unknown as { current_period_end: number; trial_end: number | null };
    // For trialing subs, current_period_end is 0 (unbilled) — use trial_end instead.
    const periodEndTs = raw.trial_end || raw.current_period_end;
    return {
      subscriptionId: sub.id,
      status: sub.status,
      currentPeriodEnd: periodEndTs ? new Date(periodEndTs * 1000) : new Date(Date.now() + 30 * 86_400_000),
    };
  }

  async cancelSubscription(stripeSubscriptionId: string): Promise<boolean> {
    if (!this.client) return false;
    await this.client.subscriptions.cancel(stripeSubscriptionId);
    return true;
  }

  // ── Payment intents ───────────────────────────────────────────────────────

  async createPaymentIntent(params: {
    amountCents: number;
    currency?: string;
    stripeCustomerId?: string | null;
    paymentMethodId?: string | null;
    metadata?: Record<string, string>;
  }): Promise<{ id: string; clientSecret: string | null; status: string } | null> {
    if (!this.client) return null;
    const pi = await this.client.paymentIntents.create({
      amount: params.amountCents,
      currency: params.currency ?? 'cad',
      customer: params.stripeCustomerId ?? undefined,
      payment_method: params.paymentMethodId ?? undefined,
      confirm: !!params.paymentMethodId,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: params.metadata ?? {},
    });
    return { id: pi.id, clientSecret: pi.client_secret, status: pi.status };
  }

  // ── SetupIntents (card-on-file) ───────────────────────────────────────────

  async createSetupIntent(stripeCustomerId: string): Promise<{ clientSecret: string | null } | null> {
    if (!this.client) return null;
    const si = await this.client.setupIntents.create({ customer: stripeCustomerId });
    return { clientSecret: si.client_secret };
  }
}

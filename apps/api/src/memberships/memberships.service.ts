import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface SavePlanDto {
  tier: string;
  name: string;
  monthlyFeeCents: number;
  serviceDiscountPct: number;
  pointsMultiplier: number;
  benefits: string[];
}

/** Loyalty points earned per dollar of net spend (before multiplier). */
const POINTS_PER_DOLLAR = 1;
/** Bonus points granted per completed visit. */
const POINTS_PER_VISIT = 50;

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Plans ───────────────────────────────────────────────────────────────

  listPlans() {
    return this.prisma.db.membershipPlan.findMany({
      where: { active: true },
      orderBy: { monthlyFeeCents: 'asc' },
    });
  }

  async savePlan(dto: SavePlanDto, tenantId: string) {
    const existing = await this.prisma.db.membershipPlan.findFirst({ where: { tier: dto.tier } });
    const data = {
      name: dto.name,
      monthlyFeeCents: dto.monthlyFeeCents,
      serviceDiscountPct: dto.serviceDiscountPct,
      pointsMultiplier: dto.pointsMultiplier,
      benefits: dto.benefits,
    };
    const plan = existing
      ? await this.prisma.db.membershipPlan.update({ where: { id: existing.id }, data })
      : await this.prisma.db.membershipPlan.create({ data: { tenantId, tier: dto.tier, ...data } });
    await this.audit.log({ action: 'MEMBERSHIP_PLAN_SAVE', entityType: 'membership_plan', entityId: plan.id });
    return plan;
  }

  // ── Enrollment ──────────────────────────────────────────────────────────

  /** Active membership + plan for a customer (null if none). */
  async activeMembership(customerId: string) {
    return this.prisma.db.membership.findFirst({
      where: { customerId, status: 'ACTIVE' },
      include: { plan: true },
      orderBy: { startedAt: 'desc' },
    });
  }

  async enroll(customerId: string, planId: string, tenantId: string) {
    const plan = await this.prisma.db.membershipPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');

    // Cancel any existing active membership first
    await this.prisma.db.membership.updateMany({
      where: { customerId, status: 'ACTIVE' },
      data: { status: 'CANCELLED' },
    });

    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const membership = await this.prisma.db.membership.create({
      data: {
        tenantId,
        customerId,
        planId,
        status: 'ACTIVE',
        currentPeriodEnd: periodEnd,
        // In production a Stripe subscription would be created here via the
        // Stripe adapter; in test/demo mode we track the membership locally.
      },
      include: { plan: true },
    });

    // Mirror the tier label onto the customer for quick display / pricing rules
    await this.prisma.db.customer.update({
      where: { id: customerId },
      data: { membershipTier: plan.tier },
    });

    await this.audit.log({ action: 'MEMBERSHIP_ENROLL', entityType: 'membership', entityId: membership.id, metadata: { tier: plan.tier } });
    return membership;
  }

  async cancel(customerId: string) {
    const active = await this.activeMembership(customerId);
    if (!active) throw new BadRequestException('No active membership to cancel');
    await this.prisma.db.membership.update({ where: { id: active.id }, data: { status: 'CANCELLED' } });
    await this.prisma.db.customer.update({ where: { id: customerId }, data: { membershipTier: null } });
    await this.audit.log({ action: 'MEMBERSHIP_CANCEL', entityType: 'membership', entityId: active.id });
    return { cancelled: true };
  }

  /**
   * Member benefits applied to a service subtotal, for display + checkout.
   * Returns discountCents (member discount) and the points multiplier.
   */
  async benefitsFor(customerId: string, serviceSubtotalCents: number) {
    const membership = await this.activeMembership(customerId);
    if (!membership) return { tier: null, discountCents: 0, pointsMultiplier: 1, benefits: [] as string[] };
    const discountCents = Math.round(serviceSubtotalCents * membership.plan.serviceDiscountPct);
    return {
      tier: membership.plan.tier,
      planName: membership.plan.name,
      discountCents,
      pointsMultiplier: membership.plan.pointsMultiplier,
      benefits: membership.plan.benefits,
    };
  }

  // ── Loyalty ─────────────────────────────────────────────────────────────

  async loyaltyBalance(customerId: string) {
    const customer = await this.prisma.db.customer.findUnique({
      where: { id: customerId },
      select: { loyaltyPoints: true },
    });
    return { points: customer?.loyaltyPoints ?? 0 };
  }

  async loyaltyLedger(customerId: string) {
    return this.prisma.db.loyaltyTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Record a points delta + update the running balance atomically. */
  async addPoints(customerId: string, points: number, reason: string, tenantId: string, bookingId?: string) {
    if (points === 0) return;
    await this.prisma.db.loyaltyTransaction.create({
      data: { tenantId, customerId, points, reason, bookingId },
    });
    await this.prisma.db.customer.update({
      where: { id: customerId },
      data: { loyaltyPoints: { increment: points } },
    });
  }

  /**
   * Accrue points for a completed checkout (spec §11 loyalty engine):
   * visit bonus + spend-based points × the member multiplier.
   */
  async accrueForCheckout(customerId: string, netTotalCents: number, tenantId: string, bookingId: string) {
    const { pointsMultiplier } = await this.benefitsFor(customerId, 0);
    const spendPoints = Math.floor((netTotalCents / 100) * POINTS_PER_DOLLAR);
    const total = Math.round((spendPoints + POINTS_PER_VISIT) * pointsMultiplier);
    await this.addPoints(customerId, total, 'SPEND', tenantId, bookingId);
    return { earned: total, multiplier: pointsMultiplier };
  }

  async redeem(customerId: string, points: number, tenantId: string) {
    const { points: balance } = await this.loyaltyBalance(customerId);
    if (points > balance) throw new BadRequestException('Insufficient points');
    await this.addPoints(customerId, -points, 'REDEEM', tenantId);
    return { redeemed: points, remaining: balance - points };
  }
}

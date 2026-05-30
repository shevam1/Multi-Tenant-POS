import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { MembershipsService, SavePlanDto } from './memberships.service';

@Controller('memberships')
export class MembershipsController {
  constructor(private readonly svc: MembershipsService) {}

  // ── Plans ───────────────────────────────────────────────────────────────

  @Get('plans')
  listPlans() {
    return this.svc.listPlans();
  }

  @Roles('FRANCHISE_HQ_ADMIN', 'STORE_MANAGER')
  @Post('plans')
  savePlan(@Body() dto: SavePlanDto, @CurrentUser() user: AuthUser) {
    return this.svc.savePlan(dto, user.tenantId);
  }

  // ── Enrollment ──────────────────────────────────────────────────────────

  @Get('customer/:customerId')
  customerMembership(@Param('customerId') customerId: string) {
    return this.svc.activeMembership(customerId);
  }

  @Roles('FRANCHISE_HQ_ADMIN', 'STORE_MANAGER', 'RECEPTION', 'CALL_CENTER_AGENT')
  @Post('customer/:customerId/enroll')
  enroll(
    @Param('customerId') customerId: string,
    @Body('planId') planId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.enroll(customerId, planId, user.tenantId);
  }

  @Roles('FRANCHISE_HQ_ADMIN', 'STORE_MANAGER', 'RECEPTION')
  @Post('customer/:customerId/cancel')
  cancel(@Param('customerId') customerId: string) {
    return this.svc.cancel(customerId);
  }

  // ── Loyalty ─────────────────────────────────────────────────────────────

  @Get('customer/:customerId/loyalty')
  async loyalty(@Param('customerId') customerId: string) {
    const [balance, ledger] = await Promise.all([
      this.svc.loyaltyBalance(customerId),
      this.svc.loyaltyLedger(customerId),
    ]);
    return { ...balance, ledger };
  }

  @Roles('FRANCHISE_HQ_ADMIN', 'STORE_MANAGER', 'RECEPTION')
  @Post('customer/:customerId/loyalty/redeem')
  redeem(
    @Param('customerId') customerId: string,
    @Body('points') points: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.redeem(customerId, points, user.tenantId);
  }
}

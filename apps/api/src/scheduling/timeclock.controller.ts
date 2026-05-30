import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { TimeclockService } from './timeclock.service';

@Controller('timeclock')
export class TimeclockController {
  constructor(private readonly svc: TimeclockService) {}

  /** GET /timeclock/status — am I currently clocked in? */
  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.svc.status(user.userId, user.storeId ?? '');
  }

  /** POST /timeclock/in — clock in */
  @Post('in')
  clockIn(@CurrentUser() user: AuthUser) {
    if (!user.storeId) throw new Error('No store assigned');
    return this.svc.clockIn(user.userId, user.storeId, user.tenantId);
  }

  /** POST /timeclock/out — clock out */
  @Post('out')
  clockOut(@CurrentUser() user: AuthUser) {
    return this.svc.clockOut(user.userId, user.storeId ?? '');
  }

  /** GET /timeclock/history — entries for current user (or specific user for managers) */
  @Get('history')
  history(
    @CurrentUser() user: AuthUser,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const targetUser = user.role === 'STORE_MANAGER' || user.role === 'FRANCHISE_HQ_ADMIN'
      ? userId
      : user.userId;
    return this.svc.history(user.storeId ?? '', targetUser, from, to);
  }

  /**
   * GET /timeclock/report — hours per employee for a date range.
   * Spec §12: "surfaces hours worked per employee and flags incomplete entries."
   */
  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Get('report')
  hoursReport(
    @Query('storeId') storeId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.svc.hoursReport(storeId, from, to);
  }

  /** POST /timeclock/flag-incomplete — flag orphaned entries (cron or manual trigger). */
  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Post('flag-incomplete')
  flagIncomplete() {
    return this.svc.flagIncompleteEntries();
  }
}

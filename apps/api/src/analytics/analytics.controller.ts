import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators';
import { AnalyticsService, DateRange } from './analytics.service';

function defaultRange(): DateRange {
  const to = new Date().toISOString().slice(0, 10);
  const d = new Date(); d.setDate(d.getDate() - 29);
  return { from: d.toISOString().slice(0, 10), to };
}

@Roles('FRANCHISE_HQ_ADMIN', 'STORE_MANAGER')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  @Get('revenue')
  revenue(@Query('from') from?: string, @Query('to') to?: string) {
    const range = from && to ? { from, to } : defaultRange();
    return this.svc.revenueSummary(range);
  }

  @Get('bookings')
  bookings(@Query('from') from?: string, @Query('to') to?: string) {
    const range = from && to ? { from, to } : defaultRange();
    return this.svc.bookingsSummary(range);
  }

  @Get('memberships')
  memberships() {
    return this.svc.membershipSummary();
  }

  @Get('staff-hours')
  staffHours(@Query('from') from?: string, @Query('to') to?: string) {
    const range = from && to ? { from, to } : defaultRange();
    return this.svc.staffHoursSummary(range);
  }

  @Get('top-services')
  topServices(@Query('from') from?: string, @Query('to') to?: string, @Query('limit') limit?: string) {
    const range = from && to ? { from, to } : defaultRange();
    return this.svc.topServices(range, limit ? Number(limit) : 10);
  }
}

import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import type { LeaveStatus } from '@omnipos/db';
import { SchedulingService, CreateShiftDto, UpdateShiftDto, CreateLeaveDto } from './scheduling.service';

@Controller('scheduling')
export class SchedulingController {
  constructor(private readonly svc: SchedulingService) {}

  /** List staff users for a store (for shift assignment dropdowns). */
  @Get('staff')
  listStaff(@Query('storeId') storeId: string) {
    return this.svc.listStaff(storeId);
  }

  // ── Shifts ────────────────────────────────────────────────────────────────

  @Get('shifts')
  listShifts(@Query('storeId') storeId: string, @Query('weekStart') weekStart?: string) {
    return this.svc.listShifts(storeId, weekStart);
  }

  @Get('roster')
  weeklyRoster(@Query('storeId') storeId: string, @Query('weekStart') weekStart: string) {
    return this.svc.weeklyRoster(storeId, weekStart);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Post('shifts')
  createShift(@Body() dto: CreateShiftDto, @CurrentUser() user: AuthUser) {
    return this.svc.createShift(dto, user.tenantId);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Patch('shifts/:id')
  updateShift(@Param('id') id: string, @Body() dto: UpdateShiftDto) {
    return this.svc.updateShift(id, dto);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Delete('shifts/:id')
  @HttpCode(204)
  deleteShift(@Param('id') id: string) {
    return this.svc.deleteShift(id);
  }

  // ── Leave ─────────────────────────────────────────────────────────────────

  @Get('leave')
  listLeave(@Query('storeId') storeId: string) {
    return this.svc.listLeave(storeId);
  }

  @Post('leave')
  createLeave(@Body() dto: CreateLeaveDto, @CurrentUser() user: AuthUser) {
    return this.svc.createLeave(user.userId, dto, user.tenantId);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Patch('leave/:id/review')
  reviewLeave(
    @Param('id') id: string,
    @Body('status') status: LeaveStatus,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.reviewLeave(id, status, user.userId);
  }
}

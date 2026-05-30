import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  list(@Query('storeId') storeId: string, @Query('date') date?: string) {
    return this.bookings.listForStore(storeId, date);
  }

  // ── Calendar ──────────────────────────────────────────────────────────────

  @Get('calendar')
  calendar(@Query('storeId') storeId: string, @Query('weekStart') weekStart: string) {
    return this.bookings.calendarForStore(storeId, weekStart);
  }

  @Get(':id/audit')
  audit(@Param('id') id: string) {
    return this.bookings.appointmentAudit(id);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'RECEPTION')
  @Patch(':id/reschedule')
  reschedule(@Param('id') id: string, @Body() dto: { scheduledStart?: string; scheduledEnd?: string | null; assignedGroomerId?: string | null }) {
    return this.bookings.reschedule(id, dto);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'RECEPTION')
  @Patch(':id/flags')
  setFlags(@Param('id') id: string, @Body('flags') flags: string[]) {
    return this.bookings.setFlags(id, flags ?? []);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'RECEPTION')
  @Patch(':id/confirm')
  setConfirmed(@Param('id') id: string, @Body('confirmed') confirmed: boolean, @Body('override') override?: boolean) {
    return this.bookings.setConfirmed(id, confirmed, override ?? false);
  }

  // ── Scheduling intelligence ───────────────────────────────────────────────

  @Get('availability')
  availability(@Query('storeId') storeId: string, @Query('date') date: string) {
    return this.bookings.availability(storeId, date);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'RECEPTION')
  @Post(':id/auto-schedule')
  autoSchedule(@Param('id') id: string) {
    return this.bookings.autoSchedule(id);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'RECEPTION')
  @Post(':id/groomers')
  addGroomer(@Param('id') id: string, @Body('userId') userId: string, @Body('role') role: string, @CurrentUser() user: AuthUser) {
    return this.bookings.addGroomer(id, userId, role, user.tenantId);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'RECEPTION')
  @Delete(':id/groomers/:userId')
  @HttpCode(204)
  removeGroomer(@Param('id') id: string, @Param('userId') userId: string) {
    return this.bookings.removeGroomer(id, userId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.bookings.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateBookingDto, @CurrentUser() user: AuthUser) {
    return this.bookings.create(dto, user.tenantId);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'RECEPTION')
  @Patch(':id/approve')
  approve(@Param('id') id: string, @Body('override') override?: boolean) {
    return this.bookings.approve(id, override ?? false);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateBookingStatusDto) {
    return this.bookings.updateStatus(id, dto);
  }

  @Post(':id/workflow')
  advanceWorkflow(
    @Param('id') id: string,
    @Body('stage') stage: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bookings.advanceWorkflow(id, stage, user.userId);
  }

  @Post(':id/consents')
  submitConsent(
    @Param('id') id: string,
    @Body('formType') formType: string,
    @Body('signature') signature: string,
    @Body('payload') payload: object,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bookings.submitConsent(id, formType, signature, payload ?? {}, user.tenantId);
  }

  // ── Process flows: no-show / cancel / close ───────────────────────────────

  /** Mark NO_SHOW; optionally charge a fee (card on file → Stripe; else credit). */
  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'RECEPTION')
  @Post(':id/no-show')
  noShow(@Param('id') id: string, @Body('feeCents') feeCents?: number) {
    return this.bookings.markNoShow(id, feeCents ?? 0);
  }

  /** Cancel with optional reason + cancellation fee. */
  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'RECEPTION')
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body('reason') reason?: string, @Body('feeCents') feeCents?: number) {
    return this.bookings.cancelBooking(id, reason, feeCents ?? 0);
  }

  /** Force-close an unclosed booking → COMPLETED. */
  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'RECEPTION')
  @Post(':id/close')
  close(@Param('id') id: string) {
    return this.bookings.closeBooking(id);
  }
}

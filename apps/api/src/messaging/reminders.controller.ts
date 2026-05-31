import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import type { AutomationType, MessageChannel } from '@omnipos/db';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { RemindersService } from './reminders.service';

@Roles('RECEPTION', 'STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'CALL_CENTER_AGENT')
@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  list(@Query('type') type: AutomationType, @Query('storeId') storeId?: string) {
    return this.reminders.remindersForType(type, storeId || undefined);
  }

  @Post('send')
  send(@Body('bookingId') bookingId: string, @Body('type') type: AutomationType, @CurrentUser() user: AuthUser) {
    return this.reminders.sendReminder(bookingId, type, user.tenantId);
  }

  // ── Automation rules ──────────────────────────────────────────────────────

  @Get('automation')
  rules(@CurrentUser() user: AuthUser) {
    return this.reminders.listRules(user.tenantId);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Post('automation')
  saveRule(
    @Body() dto: { type: AutomationType; channel: MessageChannel; enabled: boolean; offsetHours: number; template: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.reminders.saveRule(user.tenantId, dto);
  }
}

import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { SmsAutoReplyService } from './sms-auto-reply.service';

@Controller('messaging/auto-reply')
export class SmsAutoReplyController {
  constructor(private readonly autoReply: SmsAutoReplyService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.autoReply.getConfig(user.tenantId);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Put()
  save(@Body() dto: { enabled: boolean; message?: string | null }, @CurrentUser() user: AuthUser) {
    return this.autoReply.saveConfig(user.tenantId, dto);
  }

  /** Simulate an inbound SMS to preview the auto-reply + anti-loop behavior. */
  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Post('simulate')
  simulate(@Body('phone') phone: string, @CurrentUser() user: AuthUser) {
    return this.autoReply.processInbound(user.tenantId, phone);
  }
}

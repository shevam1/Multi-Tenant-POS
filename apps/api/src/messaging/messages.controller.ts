import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { MessageChannel } from '@omnipos/db';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { MessagesService, SendMessageDto } from './messages.service';

@Roles('RECEPTION', 'STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'CALL_CENTER_AGENT')
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  // ── Templates ──────────────────────────────────────────────────────────────

  @Get('templates')
  listTemplates() {
    return this.messages.listTemplates();
  }
  @Post('templates')
  createTemplate(@Body() dto: { name: string; channel: MessageChannel; subject?: string; body: string }, @CurrentUser() user: AuthUser) {
    return this.messages.createTemplate(dto, user.tenantId);
  }
  @Patch('templates/:id')
  updateTemplate(@Param('id') id: string, @Body() dto: { name?: string; channel?: MessageChannel; subject?: string; body?: string }) {
    return this.messages.updateTemplate(id, dto);
  }
  @Delete('templates/:id')
  @HttpCode(204)
  deleteTemplate(@Param('id') id: string) {
    return this.messages.deleteTemplate(id);
  }

  @Get('threads')
  listThreads(@Query('filter') filter?: string) {
    return this.messages.listThreads(filter);
  }

  @Get('threads/:id')
  getThread(@Param('id') id: string) {
    return this.messages.getThread(id);
  }

  /** Start (or open existing) thread for a customer — used by the client picker. */
  @Post('threads')
  startThread(@Body('customerId') customerId: string, @CurrentUser() user: AuthUser) {
    return this.messages.getOrCreateThread(customerId, user.tenantId);
  }

  @Post('threads/:id/send')
  send(@Param('id') id: string, @Body() dto: SendMessageDto, @CurrentUser() user: AuthUser) {
    return this.messages.sendMessage(id, dto, user.userId, user.tenantId);
  }

  @Patch('threads/:id/read')
  markRead(@Param('id') id: string) {
    return this.messages.markRead(id);
  }

  @Patch('threads/:id/status')
  setStatus(@Param('id') id: string, @Body('status') status: 'OPEN' | 'CLOSED') {
    return this.messages.setStatus(id, status);
  }

  /** Simulate an inbound reply (two-way demo / webhook). */
  @Post('threads/:id/simulate-inbound')
  simulateInbound(@Param('id') id: string, @Body('body') body: string, @CurrentUser() user: AuthUser) {
    return this.messages.getThread(id).then(t => this.messages.receiveInbound(t.customerId, body || 'Thanks!', 'SMS', user.tenantId));
  }
}

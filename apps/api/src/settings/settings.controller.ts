import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { SettingsService, StoreHourRow } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.settings.get(user.tenantId);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Patch()
  update(@Body() dto: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    return this.settings.update(user.tenantId, dto);
  }

  @Get('hours')
  getHours(@Query('storeId') storeId: string) {
    return this.settings.getHours(storeId);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Put('hours/:storeId')
  setHours(@Param('storeId') storeId: string, @Body('hours') hours: StoreHourRow[], @CurrentUser() user: AuthUser) {
    return this.settings.setHours(storeId, hours, user.tenantId);
  }

  // ── Closed calendar ─────────────────────────────────────────────────────────

  @Get('closures')
  listClosures(@Query('storeId') storeId: string) {
    return this.settings.listClosures(storeId);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Post('closures/:storeId')
  addClosure(
    @Param('storeId') storeId: string,
    @Body() dto: { startDate: string; endDate?: string; reason?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.settings.addClosure(storeId, dto, user.tenantId);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Delete('closures/:id')
  @HttpCode(204)
  removeClosure(@Param('id') id: string) {
    return this.settings.removeClosure(id);
  }
}

import { Body, Controller, Get, Param, Patch, Put, Query } from '@nestjs/common';
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
}

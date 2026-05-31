import { Body, Controller, Get, Param, Patch, Put, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { PayrollService, type PayrollConfigDto, type RosterUpdateDto } from './payroll.service';

@Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('config')
  getConfig(@CurrentUser() user: AuthUser) {
    return this.payroll.getConfig(user.tenantId);
  }

  @Put('config')
  saveConfig(@Body() dto: PayrollConfigDto, @CurrentUser() user: AuthUser) {
    return this.payroll.saveConfig(user.tenantId, dto);
  }

  @Get('roster')
  roster(@Query('storeId') storeId?: string) {
    return this.payroll.roster(storeId || undefined);
  }

  @Patch('roster/:userId')
  updateRoster(@Param('userId') userId: string, @Body() dto: RosterUpdateDto) {
    return this.payroll.updateRoster(userId, dto);
  }

  @Get('summary')
  summary(
    @Query('storeId') storeId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payroll.summary(user.tenantId, storeId, from, to);
  }
}

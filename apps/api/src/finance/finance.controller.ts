import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { FinanceService, SaveExpenseDto } from './finance.service';

function defaultRange() {
  const to = new Date().toISOString().slice(0, 10);
  const d = new Date(); d.setDate(d.getDate() - 29);
  return { from: d.toISOString().slice(0, 10), to };
}

@Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('report')
  report(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('storeId') storeId?: string,
    @Query('service') service?: string,
  ) {
    const range = from && to ? { from, to } : defaultRange();
    return this.finance.report({ ...range, storeId: storeId || undefined, service: service || undefined });
  }

  @Get('services')
  services() {
    return this.finance.serviceNames();
  }

  @Get('expenses')
  listExpenses(@Query('storeId') storeId?: string) {
    return this.finance.listExpenses(storeId || undefined);
  }

  @Post('expenses')
  createExpense(@Body() dto: SaveExpenseDto, @CurrentUser() user: AuthUser) {
    return this.finance.createExpense(dto, user.tenantId, user.userId);
  }

  @Delete('expenses/:id')
  @HttpCode(204)
  deleteExpense(@Param('id') id: string) {
    return this.finance.deleteExpense(id);
  }
}

import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { CouponsService, SaveCouponDto } from './coupons.service';

@Controller('coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  list() {
    return this.coupons.list();
  }

  /** Validate a code against a subtotal (preview the discount, no redemption). */
  @Get('validate')
  validate(@Query('code') code: string, @Query('subtotalCents') subtotalCents: string) {
    return this.coupons.validate(code, Number(subtotalCents) || 0);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'RECEPTION')
  @Post()
  create(@Body() dto: SaveCouponDto, @CurrentUser() user: AuthUser) {
    return this.coupons.create(dto, user.tenantId);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<SaveCouponDto>) {
    return this.coupons.update(id, dto);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.coupons.remove(id);
  }
}

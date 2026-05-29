import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { PosService } from './pos.service';
import { CheckoutDto } from './dto/checkout.dto';
import type { Province } from '@omnipos/core';

@Controller('pos')
export class PosController {
  constructor(private readonly pos: PosService) {}

  /** Preview checkout totals without writing to DB (POS display). */
  @Post('preview')
  preview(
    @Body() dto: CheckoutDto,
    @Query('province') province: string,
  ) {
    return this.pos.previewCheckout(dto, province as Province);
  }

  /** Finalise checkout for a booking. */
  @Roles('RECEPTION', 'STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Post('bookings/:bookingId/checkout')
  checkout(
    @Param('bookingId') bookingId: string,
    @Body() dto: CheckoutDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pos.checkout(bookingId, dto, user.tenantId);
  }

  /** Create Stripe SetupIntent for card-on-file (called at booking creation on web). */
  @Post('setup-intent/:customerId')
  setupIntent(@Param('customerId') customerId: string) {
    return this.pos.createSetupIntent(customerId);
  }

  @Get('store/:storeId')
  getStore(@Param('storeId') storeId: string) {
    return this.pos.getStore(storeId);
  }
}

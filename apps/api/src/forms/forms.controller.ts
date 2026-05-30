import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { FormsService, SaveTemplateDto } from './forms.service';

/** Authenticated admin endpoints: the form builder + effective-form listing. */
@Controller('forms')
export class FormsController {
  constructor(private readonly svc: FormsService) {}

  /** All forms this tenant uses (module defaults + custom). */
  @Get('effective')
  effective(@CurrentUser() user: AuthUser) {
    return this.svc.effectiveForms(user.tenantId);
  }

  /** Custom templates only (for the builder list). */
  @Get('templates')
  templates() {
    return this.svc.listTemplates();
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Post('templates')
  save(@Body() dto: SaveTemplateDto, @CurrentUser() user: AuthUser) {
    return this.svc.saveTemplate(dto, user.tenantId);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Delete('templates/:id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.svc.deleteTemplate(id);
  }

  /** Mandatory forms not yet signed for a booking. */
  @Get('unsigned/:bookingId')
  unsigned(@Param('bookingId') bookingId: string, @CurrentUser() user: AuthUser) {
    return this.svc.unsignedMandatoryForms(bookingId, user.tenantId);
  }
}

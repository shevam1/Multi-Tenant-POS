import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { PetOptionsService, type PetOptionCategory, type SaveOptionDto } from './pet-options.service';

@Controller('pet-options')
export class PetOptionsController {
  constructor(private readonly options: PetOptionsService) {}

  @Get()
  listAll(@CurrentUser() user: AuthUser) {
    return this.options.listAll(user.tenantId);
  }

  @Get('vaccine-alert')
  vaccineAlert(@CurrentUser() user: AuthUser) {
    return this.options.vaccineAlert(user.tenantId);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Post()
  create(@Body() dto: SaveOptionDto, @CurrentUser() user: AuthUser) {
    return this.options.create(user.tenantId, dto);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Put('reorder')
  reorder(@Body('category') category: PetOptionCategory, @Body('orderedIds') orderedIds: string[]) {
    return this.options.reorder(category, orderedIds);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<SaveOptionDto>) {
    return this.options.update(id, dto);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.options.remove(id);
  }
}

import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { CatalogService, SaveCatalogItemDto, StoreOverrideDto } from './catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list() {
    return this.catalog.list();
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Post()
  create(@Body() dto: SaveCatalogItemDto, @CurrentUser() user: AuthUser) {
    return this.catalog.create(dto, user.tenantId);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<SaveCatalogItemDto>) {
    return this.catalog.update(id, dto);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.catalog.remove(id);
  }

  /** Set per-location pricing + availability for an item. */
  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Put(':id/stores')
  setStores(@Param('id') id: string, @Body('overrides') overrides: StoreOverrideDto[], @CurrentUser() user: AuthUser) {
    return this.catalog.setStoreOverrides(id, overrides, user.tenantId);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.catalog.duplicate(id, user.tenantId);
  }

  // ── Service categories ─────────────────────────────────────────────────────

  @Get('categories')
  categories() {
    return this.catalog.listCategories();
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Post('categories')
  createCategory(@Body('name') name: string, @CurrentUser() user: AuthUser) {
    return this.catalog.createCategory(name, user.tenantId);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Patch('categories/:id')
  renameCategory(@Param('id') id: string, @Body('name') name: string) {
    return this.catalog.renameCategory(id, name);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Put('categories/reorder')
  reorderCategories(@Body('orderedIds') orderedIds: string[]) {
    return this.catalog.reorderCategories(orderedIds);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Delete('categories/:id')
  @HttpCode(204)
  deleteCategory(@Param('id') id: string) {
    return this.catalog.deleteCategory(id);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Post('categories/:id/raise-price')
  raisePrice(@Param('id') id: string, @Body('mode') mode: 'FIXED' | 'PERCENT', @Body('value') value: number) {
    return this.catalog.raisePrice(id, mode, value);
  }
}

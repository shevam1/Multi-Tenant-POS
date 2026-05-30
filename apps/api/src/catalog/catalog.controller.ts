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
}

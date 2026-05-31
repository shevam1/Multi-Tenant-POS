import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { ProductsService, SaveProductDto } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query('storeId') storeId?: string) {
    return this.products.listProducts(storeId || undefined);
  }

  @Get('sellable')
  sellable(@Query('storeId') storeId: string) {
    return this.products.sellable(storeId);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'RECEPTION')
  @Post()
  create(@Body() dto: SaveProductDto, @CurrentUser() user: AuthUser) {
    return this.products.createProduct(dto, user.tenantId);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'RECEPTION')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<SaveProductDto>) {
    return this.products.updateProduct(id, dto);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'RECEPTION')
  @Post(':id/adjust')
  adjust(@Param('id') id: string, @Body('delta') delta: number) {
    return this.products.adjustStock(id, delta);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.products.removeProduct(id);
  }

  // ── Categories ───────────────────────────────────────────────────────────

  @Get('meta/categories')
  categories() {
    return this.products.listCategories();
  }
  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'RECEPTION')
  @Post('meta/categories')
  createCategory(@Body('name') name: string, @CurrentUser() user: AuthUser) {
    return this.products.createCategory(name, user.tenantId);
  }

  // ── Suppliers ──────────────────────────────────────────────────────────────

  @Get('meta/suppliers')
  suppliers() {
    return this.products.listSuppliers();
  }
  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'RECEPTION')
  @Post('meta/suppliers')
  createSupplier(@Body() dto: { name: string; contactName?: string; phone?: string; email?: string; notes?: string }, @CurrentUser() user: AuthUser) {
    return this.products.createSupplier(dto, user.tenantId);
  }
  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'RECEPTION')
  @Patch('meta/suppliers/:id')
  updateSupplier(@Param('id') id: string, @Body() dto: { name?: string; contactName?: string; phone?: string; email?: string; notes?: string }) {
    return this.products.updateSupplier(id, dto);
  }
}

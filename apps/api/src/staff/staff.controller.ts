import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { StaffService, CreateStaffDto, UpdateStaffDto } from './staff.service';

@Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  /** Permission catalog + role defaults (for the UI). */
  @Get('permissions')
  permissions() {
    return this.staff.permissionCatalog();
  }

  /** List staff. Store managers are auto-scoped to their own store; HQ admin sees all (or filters by storeId). */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('storeId') storeId?: string) {
    if (user.role === 'STORE_MANAGER') {
      return this.staff.list(user.storeId ?? undefined);
    }
    return this.staff.list(storeId || undefined);
  }

  @Post()
  create(@Body() dto: CreateStaffDto, @CurrentUser() user: AuthUser) {
    // Store managers can only create staff for their own store
    const storeId = user.role === 'STORE_MANAGER' ? user.storeId : dto.storeId;
    return this.staff.create({ ...dto, storeId }, user.tenantId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.staff.update(id, dto);
  }

  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body('password') password: string) {
    return this.staff.resetPassword(id, password);
  }

  @Post(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.staff.deactivate(id);
  }
}

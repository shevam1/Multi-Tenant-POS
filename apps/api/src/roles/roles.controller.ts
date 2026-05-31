import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import type { UserRole } from '@omnipos/db';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { RolesService } from './roles.service';

@Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.roles.list(user.tenantId);
  }

  @Post()
  create(@Body() dto: { name: string; baseRole: UserRole; permissions: string[]; loginEnabled?: boolean }, @CurrentUser() user: AuthUser) {
    return this.roles.create(user.tenantId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: { name?: string; permissions?: string[]; loginEnabled?: boolean }) {
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.roles.remove(id);
  }
}

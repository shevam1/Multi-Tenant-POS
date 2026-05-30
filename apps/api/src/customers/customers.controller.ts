import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { CustomersService, ListCustomersDto } from './customers.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Stores list (for location selector on Clients page) ─────────────────

  @Get('stores')
  listStores() {
    return this.prisma.db.store.findMany({
      select: { id: true, name: true, city: true, province: true },
      orderBy: { name: 'asc' },
    });
  }

  // ── Customer list ─────────────────────────────────────────────────────────

  @Get()
  list(
    @Query('q') q?: string,
    @Query('storeId') storeId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('orderBy') orderBy?: ListCustomersDto['orderBy'],
    @Query('order') order?: 'asc' | 'desc',
    @Query('noBooking') noBooking?: string,
    @Query('notSeenWeeks') notSeenWeeks?: string,
    @Query('breed') breed?: string,
    @Query('tags') tags?: string,
    @Query('membershipTier') membershipTier?: string,
    @Query('city') city?: string,
    @Query('postalCode') postalCode?: string,
  ) {
    // Legacy mode: bare search query with no pagination → flat array (used by booking form autocomplete)
    const isLegacySearch = q && !page && !limit && !storeId && !status;
    if (isLegacySearch) return this.customers.search(q);

    return this.customers.findAll({
      q, storeId, status, orderBy, order,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      noBooking: noBooking === 'true',
      notSeenWeeks: notSeenWeeks ? Number(notSeenWeeks) : undefined,
      breed, tags, membershipTier, city, postalCode,
    });
  }

  // ── Single customer ───────────────────────────────────────────────────────

  @Get('pets/:petId')
  findPet(@Param('petId') petId: string) {
    return this.customers.findPet(petId);
  }

  @Get(':id/reliability')
  reliability(@Param('id') id: string) {
    return this.customers.reliabilitySummary(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customers.findOne(id);
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customers.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(id, dto);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Delete(':id')
  @HttpCode(204)
  softDelete(@Param('id') id: string) {
    return this.customers.softDelete(id);
  }

  // ── Statement credit ──────────────────────────────────────────────────────

  @Roles('RECEPTION', 'STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'CALL_CENTER_AGENT')
  @Post(':id/credit')
  credit(@Param('id') id: string, @Body('deltaCents') deltaCents: number) {
    return this.customers.applyStatementCredit(id, deltaCents);
  }

  // ── Pets ──────────────────────────────────────────────────────────────────

  @Post(':id/pets')
  createPet(@Param('id') id: string, @Body() dto: CreatePetDto, @CurrentUser() user: AuthUser) {
    return this.customers.createPet(id, dto, user.tenantId);
  }

  @Patch(':id/pets/:petId')
  updatePet(@Param('petId') petId: string, @Body() dto: UpdatePetDto) {
    return this.customers.updatePet(petId, dto);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Delete(':id/pets/:petId')
  @HttpCode(204)
  deletePet(@Param('petId') petId: string) {
    return this.customers.deletePet(petId);
  }
}

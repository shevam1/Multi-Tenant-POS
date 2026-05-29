import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@Query('q') q?: string) {
    return q ? this.customers.search(q) : this.customers.findAll();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.customers.findOne(id);
  }

  @Get(':id/reliability')
  reliability(@Param('id') id: string) {
    return this.customers.reliabilitySummary(id);
  }

  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customers.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(id, dto);
  }

  @Roles('RECEPTION', 'STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'CALL_CENTER_AGENT')
  @Post(':id/credit')
  applyCredit(
    @Param('id') id: string,
    @Body('deltaCents') deltaCents: number,
  ) {
    return this.customers.applyStatementCredit(id, deltaCents);
  }

  // ---- Pets ----
  @Post(':id/pets')
  createPet(
    @Param('id') id: string,
    @Body() dto: CreatePetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customers.createPet(id, dto, user.tenantId);
  }

  @Get('pets/:petId')
  getPet(@Param('petId') petId: string) {
    return this.customers.findPet(petId);
  }
}

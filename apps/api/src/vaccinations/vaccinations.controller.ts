import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators';
import { VaccinationsService } from './vaccinations.service';
import { CreateVaccinationDto } from './dto/create-vaccination.dto';

@Controller('vaccinations')
export class VaccinationsController {
  constructor(private readonly svc: VaccinationsService) {}

  /** List all vaccination records for a pet. */
  @Get('pet/:petId')
  list(@Param('petId') petId: string) {
    return this.svc.listForPet(petId).then(records =>
      records.map(r => ({
        ...r,
        status: VaccinationsService.expiryStatus(r.expiresAt),
      })),
    );
  }

  /** Add a vaccination record to a pet. */
  @Post('pet/:petId')
  create(@Param('petId') petId: string, @Body() dto: CreateVaccinationDto) {
    return this.svc.create(petId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateVaccinationDto) {
    return this.svc.update(id, dto);
  }

  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN')
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  /**
   * Compliance report: all pets in the tenant with their vaccination status.
   * Per spec §3: "compiles a comprehensive vaccination compliance report."
   */
  @Roles('STORE_MANAGER', 'FRANCHISE_HQ_ADMIN', 'RECEPTION')
  @Get('compliance')
  compliance(@Query('storeId') storeId?: string, @Query('q') q?: string) {
    return this.svc.complianceReport(storeId, q);
  }
}

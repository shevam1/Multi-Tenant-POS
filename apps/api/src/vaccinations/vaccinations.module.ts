import { Module } from '@nestjs/common';
import { VaccinationsController } from './vaccinations.controller';
import { VaccinationsService } from './vaccinations.service';
import { VaccinationAlertsJob } from './vaccination-alerts.job';

@Module({
  controllers: [VaccinationsController],
  providers: [VaccinationsService, VaccinationAlertsJob],
  exports: [VaccinationsService],
})
export class VaccinationsModule {}

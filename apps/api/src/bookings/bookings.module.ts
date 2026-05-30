import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { CustomersModule } from '../customers/customers.module';
import { VaccinationsModule } from '../vaccinations/vaccinations.module';

@Module({
  imports: [CustomersModule, VaccinationsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}

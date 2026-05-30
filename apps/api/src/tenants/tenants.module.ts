import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { CatalogModule } from '../catalog/catalog.module';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [CatalogModule, BookingsModule],
  controllers: [TenantsController],
})
export class TenantsModule {}

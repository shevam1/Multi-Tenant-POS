import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [CatalogModule],
  controllers: [TenantsController],
})
export class TenantsModule {}

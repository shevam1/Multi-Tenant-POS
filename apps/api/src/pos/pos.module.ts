import { Module } from '@nestjs/common';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { MembershipsModule } from '../memberships/memberships.module';
import { CouponsModule } from '../coupons/coupons.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [MembershipsModule, CouponsModule, ProductsModule],
  controllers: [PosController],
  providers: [PosService],
  exports: [PosService],
})
export class PosModule {}

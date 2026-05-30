import { Module } from '@nestjs/common';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { MembershipsModule } from '../memberships/memberships.module';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [MembershipsModule, CouponsModule],
  controllers: [PosController],
  providers: [PosService],
  exports: [PosService],
})
export class PosModule {}

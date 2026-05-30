import { Module } from '@nestjs/common';
import { SchedulingController } from './scheduling.controller';
import { SchedulingService } from './scheduling.service';
import { TimeclockController } from './timeclock.controller';
import { TimeclockService } from './timeclock.service';

@Module({
  controllers: [SchedulingController, TimeclockController],
  providers: [SchedulingService, TimeclockService],
  exports: [SchedulingService, TimeclockService],
})
export class SchedulingModule {}

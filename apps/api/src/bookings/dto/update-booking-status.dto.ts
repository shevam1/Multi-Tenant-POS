import { IsEnum, IsOptional, IsString } from 'class-validator';
import type { BookingStatus } from '@omnipos/db';

export class UpdateBookingStatusDto {
  @IsEnum(['PENDING','CONFIRMED','CHECKED_IN','IN_PROGRESS','READY','COMPLETED','CANCELLED','NO_SHOW','LATE'])
  status!: BookingStatus;

  @IsOptional() @IsString() assignedGroomerId?: string;
}

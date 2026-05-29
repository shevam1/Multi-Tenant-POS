import { IsArray, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import type { BookingSource } from '@omnipos/db';

export class CreateBookingDto {
  @IsString() storeId!: string;
  @IsString() customerId!: string;
  @IsOptional() @IsString() petId?: string;
  @IsDateString() scheduledStart!: string;
  @IsOptional() @IsDateString() scheduledEnd?: string;
  @IsOptional() @IsString() assignedGroomerId?: string;
  @IsOptional() @IsEnum(['WEB', 'POS', 'CALL_CENTER']) source?: BookingSource;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) lineItemIds?: string[];
}

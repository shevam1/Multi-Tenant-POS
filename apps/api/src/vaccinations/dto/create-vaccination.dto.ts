import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateVaccinationDto {
  @IsString() vaccineType!: string;
  @IsOptional() @IsDateString() administeredAt?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() documentUrl?: string;
}

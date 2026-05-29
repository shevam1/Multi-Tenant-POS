import { IsDateString, IsNumber, IsOptional, IsString, IsArray } from 'class-validator';

export class CreatePetDto {
  @IsString() name!: string;
  @IsOptional() @IsString() species?: string;
  @IsOptional() @IsString() breed?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsNumber() weightKg?: number;
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() allergies?: string;
  @IsOptional() @IsString() medicalNotes?: string;
  @IsOptional() @IsString() preferredGroomerId?: string;
  @IsOptional() attributes?: Record<string, unknown>;
}

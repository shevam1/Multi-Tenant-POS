import { IsEmail, IsOptional, IsString, IsArray } from 'class-validator';

export class CreateCustomerDto {
  @IsString() fullName!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() addressLine?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() membershipTier?: string;
  @IsOptional() @IsString() emergencyContact?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() preferredStoreId?: string;
}

import { IsArray, IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CheckoutLineDto {
  @IsString() description!: string;
  @IsNumber() amountCents!: number;
  @IsOptional() taxable?: boolean;
}

export class CheckoutDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutLineDto)
  lines!: CheckoutLineDto[];

  @IsEnum(['CASH', 'CARD', 'MOBILE_WALLET', 'GIFT_CARD', 'STATEMENT_CREDIT'])
  tender!: string;

  @IsOptional() @IsNumber() discountCents?: number;
  @IsOptional() @IsNumber() tipCents?: number;
  @IsOptional() @IsString() stripePaymentMethodId?: string;
  /** Optional coupon code applied to the service subtotal. */
  @IsOptional() @IsString() couponCode?: string;
  /** Retail products sold on this bill — decrement stock + add as lines. */
  @IsOptional() @IsArray() productSales?: { productId: string; qty: number }[];
}

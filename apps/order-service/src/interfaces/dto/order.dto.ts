import {
  IsString,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderItemDto {
  @IsString()
  productId: string;

  @IsString()
  productName: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0.01)
  unitPrice: number;

  @IsString()
  @IsOptional()
  currency?: string;
}

export class CreateOrderDto {
  @IsString()
  userId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}

export class ShipOrderDto {
  @IsString()
  trackingNumber: string;
}

export class CancelOrderDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class RefundOrderDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

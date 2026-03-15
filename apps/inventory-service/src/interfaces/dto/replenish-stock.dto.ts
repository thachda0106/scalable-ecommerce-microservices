import {
  IsArray,
  IsString,
  IsInt,
  IsUUID,
  Min,
  Max,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReplenishItemDto {
  @IsUUID('4')
  productId: string;

  @IsInt()
  @Min(1)
  @Max(1000000)
  quantity: number;

  @IsString()
  reason: string;
}

export class ReplenishStockDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReplenishItemDto)
  items: ReplenishItemDto[];

  @IsString()
  performedBy: string;

  @IsString()
  idempotencyKey: string;
}

import {
  IsArray,
  IsString,
  IsInt,
  IsUUID,
  IsIn,
  IsOptional,
  Min,
  Max,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReserveItemDto {
  @IsUUID('4')
  productId: string;

  @IsInt()
  @Min(1)
  @Max(1000000)
  quantity: number;
}

export class ReserveStockDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReserveItemDto)
  items: ReserveItemDto[];

  @IsUUID('4')
  referenceId: string;

  @IsIn(['CART', 'ORDER'])
  referenceType: 'CART' | 'ORDER';

  @IsString()
  idempotencyKey: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  ttlMinutes?: number;
}

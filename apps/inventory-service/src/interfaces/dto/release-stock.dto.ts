import {
  IsArray,
  IsString,
  IsUUID,
  IsIn,
  IsOptional,
} from 'class-validator';

export class ReleaseStockDto {
  @IsUUID('4')
  referenceId: string;

  @IsIn(['CART', 'ORDER'])
  referenceType: 'CART' | 'ORDER';

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  productIds?: string[];

  @IsString()
  idempotencyKey: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

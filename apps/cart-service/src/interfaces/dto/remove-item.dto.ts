import { IsUUID } from 'class-validator';

export class RemoveItemParamsDto {
  @IsUUID('4', { message: 'userId must be a valid UUID v4' })
  userId: string;

  @IsUUID('4', { message: 'productId must be a valid UUID v4' })
  productId: string;
}

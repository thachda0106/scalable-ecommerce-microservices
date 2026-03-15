import { IsString, IsUUID } from 'class-validator';

export class ConfirmStockDto {
  @IsUUID('4')
  referenceId: string;

  @IsString()
  idempotencyKey: string;
}

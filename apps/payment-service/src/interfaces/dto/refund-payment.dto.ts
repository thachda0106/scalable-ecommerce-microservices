import { IsString, IsNotEmpty } from 'class-validator';

export class RefundPaymentDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}


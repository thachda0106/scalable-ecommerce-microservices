import { IsString, IsNotEmpty } from 'class-validator';

export class RefundPaymentDto {
  @IsString()
  @IsNotEmpty()
  paymentId: string;

  @IsString()
  @IsNotEmpty()
  reason: string;
}

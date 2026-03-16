import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { PaymentProviderEnum } from '../../domain/enums/payment-provider.enum';

export class ProcessPaymentDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsInt()
  @Min(1)
  amountInCents: number;

  @IsString()
  @IsOptional()
  currency?: string = 'USD';

  @IsOptional()
  @IsEnum(PaymentProviderEnum)
  provider?: PaymentProviderEnum;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

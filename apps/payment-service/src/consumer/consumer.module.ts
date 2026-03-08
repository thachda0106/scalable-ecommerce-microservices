import { Module } from '@nestjs/common';
import { PaymentConsumerService } from './payment-consumer.service';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [PaymentModule],
  providers: [PaymentConsumerService],
})
export class ConsumerModule {}

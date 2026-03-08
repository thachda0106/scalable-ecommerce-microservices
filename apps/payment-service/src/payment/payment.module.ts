import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentService } from './payment.service';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { OutboxEvent } from '../outbox/entities/outbox-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentTransaction, OutboxEvent])],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}

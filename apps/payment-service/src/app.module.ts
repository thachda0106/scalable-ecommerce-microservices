import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getLoggerModule } from '@ecommerce/core';
import { PaymentModule } from './payment/payment.module';
import { OutboxModule } from './outbox/outbox.module';
import { ConsumerModule } from './consumer/consumer.module';
import { PaymentTransaction } from './payment/entities/payment-transaction.entity';
import { OutboxEvent } from './outbox/entities/outbox-event.entity';

@Module({
  imports: [
    getLoggerModule(),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url:
        process.env.DATABASE_URL ||
        'postgres://postgres:postgres@localhost:5432/ecommerce',
      entities: [PaymentTransaction, OutboxEvent],
      synchronize: true, // Use only for development!
    }),
    PaymentModule,
    OutboxModule,
    ConsumerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

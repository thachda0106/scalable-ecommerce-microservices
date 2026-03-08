import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getLoggerModule } from '@ecommerce/core';
import { OrdersModule } from './orders/orders.module';
import { OutboxModule } from './outbox/outbox.module';
import { SagasModule } from './sagas/sagas.module';
import { Order } from './orders/entities/order.entity';
import { OutboxEvent } from './outbox/entities/outbox-event.entity';

@Module({
  imports: [
    getLoggerModule(),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ecommerce',
      entities: [Order, OutboxEvent],
      synchronize: true, // Use only for development!
    }),
    OrdersModule,
    OutboxModule,
    SagasModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
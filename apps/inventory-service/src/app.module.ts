import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getLoggerModule } from '@ecommerce/core';
import { InventoryModule } from './inventory/inventory.module';
import { OutboxModule } from './outbox/outbox.module';
import { ConsumerModule } from './consumer/consumer.module';
import { Stock } from './inventory/entities/stock.entity';
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
      entities: [Stock, OutboxEvent],
      synchronize: true, // Use only for development!
    }),
    InventoryModule,
    OutboxModule,
    ConsumerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

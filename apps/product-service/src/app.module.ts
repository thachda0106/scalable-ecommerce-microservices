import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getLoggerModule } from '@ecommerce/core';
import { ProductsModule } from './products/products.module';
import { Product } from './products/entities/product.entity';
import { OutboxEvent } from './outbox/entities/outbox-event.entity';
import { OutboxModule } from './outbox/outbox.module';

@Module({
  imports: [
    getLoggerModule(),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ecommerce',
      entities: [Product, OutboxEvent],
      synchronize: true, // Use only for development!
    }),
    ProductsModule,
    OutboxModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

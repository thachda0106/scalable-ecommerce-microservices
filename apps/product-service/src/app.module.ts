import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { getLoggerModule } from '@ecommerce/core';
import { ProductModule } from './interfaces/product.module';
import { ProductOrmEntity } from './infrastructure/persistence/entities/product.orm-entity';
import { OutboxEventOrmEntity } from './infrastructure/persistence/entities/outbox-event.orm-entity';

@Module({
  imports: [
    ConfigModule.forRoot(),
    getLoggerModule(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url:
        process.env.DATABASE_URL ||
        'postgres://postgres:postgres@localhost:5432/ecommerce',
      entities: [ProductOrmEntity, OutboxEventOrmEntity],
      synchronize: true, // Use only for development!
    }),
    ProductModule,
  ],
})
export class AppModule {}

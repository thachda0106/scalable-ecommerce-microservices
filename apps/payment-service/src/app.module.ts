import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getLoggerModule } from '@ecommerce/core';
import { PaymentModule } from './payment.module';
import { PaymentOrmEntity } from './infrastructure/persistence/entities/payment.orm-entity';
import { OutboxEventOrmEntity } from './infrastructure/persistence/entities/outbox-event.orm-entity';
import { ProcessedEventOrmEntity } from './infrastructure/persistence/entities/processed-event.orm-entity';

@Module({
  imports: [
    getLoggerModule(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url:
        process.env.DATABASE_URL ||
        'postgres://postgres:postgres@localhost:5432/ecommerce',
      entities: [
        PaymentOrmEntity,
        OutboxEventOrmEntity,
        ProcessedEventOrmEntity,
      ],
      synchronize: process.env.DB_SYNC === 'true', // Default false — use migrations in production
    }),
    PaymentModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

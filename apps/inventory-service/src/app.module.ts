import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { getLoggerModule } from '@ecommerce/core';

import {
  inventoryConfig,
  redisConfig,
  kafkaConfig,
  databaseConfig,
} from './config/inventory.config';

import { InventoryModule } from './inventory.module';
import { HealthModule } from './health/health.module';
import { InventoryMetricsModule } from './metrics/metrics.module';

// ORM entities for TypeORM root
import { ProductInventoryOrmEntity } from './infrastructure/persistence/entities/product-inventory.orm-entity';
import { StockReservationOrmEntity } from './infrastructure/persistence/entities/stock-reservation.orm-entity';
import { StockMovementOrmEntity } from './infrastructure/persistence/entities/stock-movement.orm-entity';
import { OutboxEventOrmEntity } from './infrastructure/persistence/entities/outbox-event.orm-entity';
import { ProcessedEventOrmEntity } from './infrastructure/persistence/entities/processed-event.orm-entity';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [inventoryConfig, redisConfig, kafkaConfig, databaseConfig],
    }),

    // Logger
    getLoggerModule(),

    // Scheduler for cron jobs (outbox relay, expiry worker)
    ScheduleModule.forRoot(),

    // Database — config-driven, NOT hardcoded
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.get('database.url'),
        entities: [
          ProductInventoryOrmEntity,
          StockReservationOrmEntity,
          StockMovementOrmEntity,
          OutboxEventOrmEntity,
          ProcessedEventOrmEntity,
        ],
        synchronize: config.get('database.synchronize', false),
        extra: {
          min: config.get('database.poolMin', 5),
          max: config.get('database.poolMax', 20),
        },
      }),
    }),

    // Feature modules
    InventoryModule,
    HealthModule,
    InventoryMetricsModule,
  ],
  providers: [
    // Redis client factory — shared across modules
    {
      provide: 'REDIS_CLIENT',
      useFactory: (config: ConfigService) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Redis = require('ioredis');
        return new Redis({
          host: config.get('redis.host'),
          port: config.get('redis.port'),
          password: config.get('redis.password'),
          lazyConnect: true,
          retryStrategy: (times: number) => Math.min(times * 100, 3000),
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class AppModule {}

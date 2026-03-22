import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { getLoggerModule, InboxEventEntity } from '@ecommerce/core';

// Infrastructure modules
import { OpenSearchModule } from './infrastructure/opensearch/opensearch.module';
import { KafkaModule } from './infrastructure/kafka/kafka.module';
import { CacheModule } from './infrastructure/cache/cache.module';

// Metrics
import { SearchMetricsService } from './infrastructure/metrics/search-metrics.service';

// Inbox
import { InboxSchedulerService } from './infrastructure/kafka/inbox-scheduler.service';

// Interface
import { SearchController } from './interfaces/controllers/search.controller';
import { ServiceAuthGuard } from './interfaces/guards/service-auth.guard';

// Handlers
import {
  IndexProductHandler,
  RemoveProductHandler,
  RebuildIndexHandler,
  SearchProductsHandler,
  GetSuggestionsHandler,
  GetProductByIdHandler,
} from './application/handlers';

const CommandHandlers = [
  IndexProductHandler,
  RemoveProductHandler,
  RebuildIndexHandler,
];

const QueryHandlers = [
  SearchProductsHandler,
  GetSuggestionsHandler,
  GetProductByIdHandler,
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CqrsModule,
    getLoggerModule(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),

    // TypeORM — required for Inbox Pattern persistence
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        url:
          configService.get<string>('DATABASE_URL') ||
          'postgres://postgres:postgres@localhost:5432/search_db',
        entities: [InboxEventEntity],
        synchronize: configService.get<string>('DB_SYNC') === 'true',
      }),
    }),

    OpenSearchModule,
    KafkaModule,
    CacheModule,
  ],
  controllers: [SearchController],
  providers: [
    // Global rate limiting guard
    { provide: APP_GUARD, useClass: ThrottlerGuard },

    ...CommandHandlers,
    ...QueryHandlers,
    SearchMetricsService,
    ServiceAuthGuard,
    InboxSchedulerService,
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { getLoggerModule } from '@ecommerce/core';

// Infrastructure modules
import { OpenSearchModule } from './infrastructure/opensearch/opensearch.module';
import { KafkaModule } from './infrastructure/kafka/kafka.module';
import { CacheModule } from './infrastructure/cache/cache.module';

// Metrics
import { SearchMetricsService } from './infrastructure/metrics/search-metrics.service';

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
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
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
  ],
})
export class AppModule {}

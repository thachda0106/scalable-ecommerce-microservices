import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { getLoggerModule } from '@ecommerce/core';

// Infrastructure modules
import { OpenSearchModule } from './infrastructure/opensearch/opensearch.module';
import { KafkaModule } from './infrastructure/kafka/kafka.module';
import { CacheModule } from './infrastructure/cache/cache.module';

// Metrics
import { SearchMetricsService } from './infrastructure/metrics/search-metrics.service';

// Interface
import { SearchController } from './interfaces/controllers/search.controller';

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
    OpenSearchModule,
    KafkaModule,
    CacheModule,
  ],
  controllers: [SearchController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    SearchMetricsService,
  ],
})
export class AppModule {}

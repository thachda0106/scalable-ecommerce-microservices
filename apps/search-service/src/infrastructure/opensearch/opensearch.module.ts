import { Module, Global, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { openSearchClientProvider, OPENSEARCH_CLIENT } from './opensearch-client.provider';
import { OpenSearchIndexAdapter } from './opensearch-index.adapter';
import { OpenSearchQueryAdapter } from './opensearch-query.adapter';
import { IndexManagementService } from './index-management.service';
import { SEARCH_INDEX_PORT } from '../../domain/ports/search-index.port';
import { SEARCH_QUERY_PORT } from '../../domain/ports/search-query.port';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    openSearchClientProvider,
    {
      provide: SEARCH_INDEX_PORT,
      useClass: OpenSearchIndexAdapter,
    },
    {
      provide: SEARCH_QUERY_PORT,
      useClass: OpenSearchQueryAdapter,
    },
    IndexManagementService,
  ],
  exports: [SEARCH_INDEX_PORT, SEARCH_QUERY_PORT, IndexManagementService],
})
export class OpenSearchModule implements OnModuleInit {
  constructor(private readonly indexManagement: IndexManagementService) {}

  async onModuleInit(): Promise<void> {
    await this.indexManagement.ensureIndex();
  }
}

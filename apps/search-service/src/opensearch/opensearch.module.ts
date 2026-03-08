import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenSearchService } from './opensearch.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [OpenSearchService],
  exports: [OpenSearchService],
})
export class OpenSearchModule {}

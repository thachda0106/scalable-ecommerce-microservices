import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getLoggerModule } from '@ecommerce/core';
import { OpenSearchModule } from './opensearch/opensearch.module';
import { ConsumerModule } from './consumer/consumer.module';

@Module({
  imports: [getLoggerModule(), OpenSearchModule, ConsumerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ProductSyncService } from './product-sync.service';

@Module({
  providers: [ProductSyncService],
})
export class ConsumerModule {}

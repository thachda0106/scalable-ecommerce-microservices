import { Module } from '@nestjs/common';
import { InventoryConsumerService } from './inventory-consumer.service';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  providers: [InventoryConsumerService],
})
export class ConsumerModule {}

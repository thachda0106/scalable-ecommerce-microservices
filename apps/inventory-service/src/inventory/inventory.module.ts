import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryService } from './inventory.service';
import { Stock } from './entities/stock.entity';
import { OutboxEvent } from '../outbox/entities/outbox-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Stock, OutboxEvent])],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}

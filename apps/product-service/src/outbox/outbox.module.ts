import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxEvent } from './entities/outbox-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent])],
  providers: [OutboxRelayService],
  exports: [OutboxRelayService],
})
export class OutboxModule {}

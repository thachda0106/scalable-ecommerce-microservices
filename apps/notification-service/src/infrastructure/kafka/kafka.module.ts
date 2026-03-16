import { Module } from '@nestjs/common';
import { UserEventsConsumer } from './consumers/user-events.consumer';
import { OrderEventsConsumer } from './consumers/order-events.consumer';
import { CartEventsConsumer } from './consumers/cart-events.consumer';

@Module({
  providers: [UserEventsConsumer, OrderEventsConsumer, CartEventsConsumer],
  exports: [UserEventsConsumer, OrderEventsConsumer, CartEventsConsumer],
})
export class KafkaModule {}

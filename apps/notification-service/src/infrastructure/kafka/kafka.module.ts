import { Module } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { kafkaConfig } from './kafka.config';
import { UserEventsConsumer } from './consumers/user-events.consumer';
import { OrderEventsConsumer } from './consumers/order-events.consumer';
import { CartEventsConsumer } from './consumers/cart-events.consumer';

export const KAFKA_CLIENT = Symbol('KAFKA_CLIENT');

const kafkaClientProvider = {
  provide: KAFKA_CLIENT,
  useFactory: () =>
    new Kafka({
      clientId: kafkaConfig.clientId,
      brokers: kafkaConfig.brokers,
    }),
};

@Module({
  providers: [
    kafkaClientProvider,
    UserEventsConsumer,
    OrderEventsConsumer,
    CartEventsConsumer,
  ],
  exports: [
    kafkaClientProvider,
    UserEventsConsumer,
    OrderEventsConsumer,
    CartEventsConsumer,
  ],
})
export class KafkaModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProductEventConsumer } from './consumers/product-event.consumer';

@Module({
  imports: [ConfigModule],
  providers: [ProductEventConsumer],
})
export class KafkaModule {}

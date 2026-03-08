import { Module } from '@nestjs/common';
import { NotificationConsumerService } from './notification-consumer.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  providers: [NotificationConsumerService],
})
export class ConsumerModule {}

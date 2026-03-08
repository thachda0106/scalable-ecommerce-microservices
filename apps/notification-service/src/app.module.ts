import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getLoggerModule } from '@ecommerce/core';
import { NotificationModule } from './notification/notification.module';
import { ConsumerModule } from './consumer/consumer.module';

@Module({
  imports: [getLoggerModule(), NotificationModule, ConsumerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
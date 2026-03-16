import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { getLoggerModule } from '@ecommerce/core';
import { NotificationCoreModule } from './notification.module';

@Module({
  imports: [getLoggerModule(), NotificationCoreModule],
  controllers: [AppController],
})
export class AppModule {}

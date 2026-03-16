import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getLoggerModule } from '@ecommerce/core';
import { NotificationCoreModule } from './notification.module';

@Module({
  imports: [getLoggerModule(), NotificationCoreModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

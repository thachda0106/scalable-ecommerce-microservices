import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { getLoggerModule, InboxEventEntity } from '@ecommerce/core';
import { NotificationCoreModule } from './notification.module';

@Module({
  imports: [
    getLoggerModule(),
    ScheduleModule.forRoot(),

    // TypeORM — required for Inbox Pattern persistence
    TypeOrmModule.forRoot({
      type: 'postgres',
      url:
        process.env.DATABASE_URL ||
        'postgres://postgres:postgres@localhost:5432/notification_db',
      entities: [InboxEventEntity],
      synchronize: process.env.DB_SYNC === 'true',
    }),

    NotificationCoreModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

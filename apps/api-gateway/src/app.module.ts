import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getLoggerModule } from '@ecommerce/core';

@Module({
  imports: [getLoggerModule()],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getLoggerModule } from '@ecommerce/core';
import { CartModule } from './cart/cart.module';

@Module({
  imports: [getLoggerModule(), CartModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
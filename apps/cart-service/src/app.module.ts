import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { getLoggerModule, MetricsModule } from '@ecommerce/core';
import { CartModule } from './cart.module';
import { HealthController } from './interfaces/controllers/health.controller';
import { RedisHealthIndicator } from './infrastructure/redis/redis-health.indicator';

@Module({
  imports: [getLoggerModule(), MetricsModule, TerminusModule, CartModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class AppModule {}

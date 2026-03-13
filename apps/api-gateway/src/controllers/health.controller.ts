import { Controller, Get, Inject } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../app.module';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @HealthCheck()
  async readiness() {
    return this.health.check([
      async (): Promise<HealthIndicatorResult> => {
        try {
          const result = await this.redis.ping();
          return {
            redis: {
              status: result === 'PONG' ? 'up' : 'down',
            },
          };
        } catch {
          return {
            redis: { status: 'down' },
          };
        }
      },
    ]);
  }
}

import { Injectable, Inject } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import Redis from 'ioredis';

/**
 * Custom health indicator that checks Redis connectivity via PING.
 */
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const pong = await this.redis.ping();
      const isHealthy = pong === 'PONG';

      const result = this.getStatus(key, isHealthy);
      if (isHealthy) return result;

      throw new HealthCheckError('Redis check failed', result);
    } catch (err) {
      if (err instanceof HealthCheckError) throw err;
      throw new HealthCheckError(
        'Redis check failed',
        this.getStatus(key, false, { message: String(err) }),
      );
    }
  }
}

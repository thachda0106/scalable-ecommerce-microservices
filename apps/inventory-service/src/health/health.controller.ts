import { Controller, Get, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';

@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  @Get()
  liveness() {
    return { status: 'up', uptime: process.uptime() };
  }

  @Get('ready')
  async readiness() {
    const checks: Record<
      string,
      { status: string; latency_ms?: number }
    > = {};

    // Database check
    const dbStart = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      checks.database = { status: 'up', latency_ms: Date.now() - dbStart };
    } catch {
      checks.database = { status: 'down' };
    }

    // Redis check
    const redisStart = Date.now();
    try {
      await this.redis.ping();
      checks.redis = {
        status: 'up',
        latency_ms: Date.now() - redisStart,
      };
    } catch {
      checks.redis = { status: 'down' };
    }

    const allUp = Object.values(checks).every(
      (c) => c.status === 'up',
    );

    return { status: allUp ? 'ready' : 'degraded', checks };
  }
}

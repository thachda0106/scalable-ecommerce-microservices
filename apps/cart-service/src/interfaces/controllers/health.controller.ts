import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  HealthCheckResult,
} from '@nestjs/terminus';
import { RedisHealthIndicator } from '../../infrastructure/redis/redis-health.indicator';

/**
 * Health check endpoint for Kubernetes readiness/liveness probes.
 * Checks Redis connectivity — all cart operations depend on it.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly redisHealth: RedisHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.redisHealth.isHealthy('redis')]);
  }
}

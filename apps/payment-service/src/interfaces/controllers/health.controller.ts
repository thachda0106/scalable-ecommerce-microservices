import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  HealthCheckResult,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

/**
 * Health check endpoint for Kubernetes readiness/liveness probes.
 * Checks PostgreSQL connectivity — all payment operations depend on it.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}

import { Controller, Get, Inject } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiExcludeController,
} from '@nestjs/swagger';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../common/constants';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @ApiOperation({
    summary: 'Liveness probe',
    description: 'Returns 200 if the API Gateway process is running.',
  })
  @ApiResponse({ status: 200, description: 'Service is alive', schema: { example: { status: 'ok', timestamp: '2026-03-15T09:00:00.000Z' } } })
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @ApiOperation({
    summary: 'Readiness probe',
    description: 'Returns 200 when all dependencies (Redis) are reachable.',
  })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  @ApiResponse({ status: 503, description: 'One or more dependencies are down' })
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

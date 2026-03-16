import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check() {
    let dbStatus = 'up';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      dbStatus = 'down';
    }

    return {
      status: dbStatus === 'up' ? 'ok' : 'degraded',
      service: 'user-service',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbStatus,
      },
    };
  }
}

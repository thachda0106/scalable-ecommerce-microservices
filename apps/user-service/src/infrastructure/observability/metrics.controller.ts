import { Controller, Get, Header } from '@nestjs/common';
import { UserMetricsService } from './user-metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: UserMetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }
}

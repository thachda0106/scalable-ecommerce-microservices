import { Controller, Get, Header } from '@nestjs/common';
import { OrderMetricsService } from './order-metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: OrderMetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }
}

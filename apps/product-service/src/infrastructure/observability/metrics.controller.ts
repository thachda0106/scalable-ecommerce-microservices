import { Controller, Get, Header } from '@nestjs/common';
import { ProductMetricsService } from './product-metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: ProductMetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }
}

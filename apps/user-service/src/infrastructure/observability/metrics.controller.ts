import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { UserMetricsService } from './user-metrics.service';
import { ServiceAuthGuard } from '../../interfaces/guards/service-auth.guard';

@Controller('metrics')
@UseGuards(ServiceAuthGuard)
export class MetricsController {
  constructor(private readonly metricsService: UserMetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }
}

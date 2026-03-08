import { PrometheusModule } from '@willsoto/nestjs-prometheus';

export const MetricsModule = PrometheusModule.register({
  path: '/metrics',
  defaultMetrics: {
    enabled: true,
  },
});

import { Injectable } from '@nestjs/common';
import { Counter, Histogram } from 'prom-client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

@Injectable()
export class MetricsService {
  constructor(
    @InjectMetric('payment_processing_total')
    private readonly processingTotal: Counter<string>,
    @InjectMetric('payment_success_total')
    private readonly successTotal: Counter<string>,
    @InjectMetric('payment_failure_total')
    private readonly failureTotal: Counter<string>,
    @InjectMetric('payment_processing_duration_seconds')
    private readonly processingDuration: Histogram<string>,
  ) {}

  incrementProcessing(provider: string) {
    this.processingTotal.inc({ provider });
  }

  incrementSuccess(provider: string) {
    this.successTotal.inc({ provider });
  }

  incrementFailure(provider: string, reason: string) {
    this.failureTotal.inc({ provider, reason });
  }

  startProcessingTimer(provider: string) {
    return this.processingDuration.startTimer({ provider });
  }
}

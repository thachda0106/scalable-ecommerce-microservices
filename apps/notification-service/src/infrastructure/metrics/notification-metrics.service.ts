import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';

@Injectable()
export class NotificationMetricsService {

  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @InjectMetric('notification_sent_total')
    private readonly sentCounter: Counter<string>,
    @InjectMetric('notification_failed_total')
    private readonly failedCounter: Counter<string>,
    @InjectMetric('notification_retry_total')
    private readonly retryCounter: Counter<string>,
    @InjectMetric('notification_dlq_total')
    private readonly dlqCounter: Counter<string>,
  ) {}

  incrementSent(channel: string): void {
    this.sentCounter.inc({ channel });
  }

  incrementFailed(channel: string): void {
    this.failedCounter.inc({ channel });
  }

  incrementRetries(): void {
    this.retryCounter.inc();
  }

  incrementDlq(): void {
    this.dlqCounter.inc();
  }

  getMetrics(): Record<string, unknown> {
    return { status: 'Metrics exposed via /metrics endpoint' };
  }
}

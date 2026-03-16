import { Injectable, Logger } from '@nestjs/common';

/**
 * Simple counter-based metrics for notification operations.
 * In production, use prom-client for Prometheus integration.
 */
@Injectable()
export class NotificationMetricsService {
  private readonly logger = new Logger(NotificationMetricsService.name);
  private readonly sentCounters: Map<string, number> = new Map();
  private readonly failedCounters: Map<string, number> = new Map();
  private retryCount = 0;
  private dlqCount = 0;

  incrementSent(channel: string): void {
    const current = this.sentCounters.get(channel) || 0;
    this.sentCounters.set(channel, current + 1);
  }

  incrementFailed(channel: string): void {
    const current = this.failedCounters.get(channel) || 0;
    this.failedCounters.set(channel, current + 1);
  }

  incrementRetries(): void {
    this.retryCount++;
  }

  incrementDlq(): void {
    this.dlqCount++;
  }

  getMetrics(): Record<string, unknown> {
    return {
      sent: Object.fromEntries(this.sentCounters),
      failed: Object.fromEntries(this.failedCounters),
      retries: this.retryCount,
      dlq: this.dlqCount,
    };
  }
}

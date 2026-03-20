import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge, Registry } from 'prom-client';

@Injectable()
export class OrderMetricsService {
  private readonly registry: Registry;
  private readonly ordersCreatedTotal: Counter;
  private readonly orderStatusChangesTotal: Counter;
  private readonly orderProcessingDuration: Histogram;
  private readonly activeOrdersGauge: Gauge;

  constructor() {
    this.registry = new Registry();

    this.ordersCreatedTotal = new Counter({
      name: 'orders_created_total',
      help: 'Total number of orders created',
      registers: [this.registry],
    });

    this.orderStatusChangesTotal = new Counter({
      name: 'order_status_changes_total',
      help: 'Total number of order status changes',
      labelNames: ['from_status', 'to_status'],
      registers: [this.registry],
    });

    this.orderProcessingDuration = new Histogram({
      name: 'order_processing_duration_seconds',
      help: 'Order processing duration in seconds',
      labelNames: ['operation'],
      buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [this.registry],
    });

    this.activeOrdersGauge = new Gauge({
      name: 'active_orders',
      help: 'Number of active (non-terminal) orders',
      registers: [this.registry],
    });
  }

  incrementOrdersCreated(): void {
    this.ordersCreatedTotal.inc();
  }

  recordStatusChange(fromStatus: string, toStatus: string): void {
    this.orderStatusChangesTotal.inc({
      from_status: fromStatus,
      to_status: toStatus,
    });
  }

  startTimer(operation: string): () => void {
    return this.orderProcessingDuration.startTimer({ operation });
  }

  setActiveOrders(count: number): void {
    this.activeOrdersGauge.set(count);
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}

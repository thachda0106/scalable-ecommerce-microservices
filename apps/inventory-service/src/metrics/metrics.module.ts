import { Module } from '@nestjs/common';
import {
  makeCounterProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';
import { MetricsModule as CoreMetricsModule } from '@ecommerce/core';
import { InventoryMetricsService } from './inventory-metrics.service';

@Module({
  imports: [CoreMetricsModule],
  providers: [
    InventoryMetricsService,
    makeCounterProvider({
      name: 'inventory_reservations_total',
      help: 'Total stock reservation attempts',
      labelNames: ['status'],
    }),
    makeCounterProvider({
      name: 'inventory_releases_total',
      help: 'Total stock releases',
      labelNames: ['reason'],
    }),
    makeCounterProvider({
      name: 'inventory_confirmations_total',
      help: 'Total order confirmations',
      labelNames: ['status'],
    }),
    makeCounterProvider({
      name: 'inventory_oversell_attempts_total',
      help: 'Oversell prevention triggers',
    }),
    makeHistogramProvider({
      name: 'inventory_operation_duration_seconds',
      help: 'Latency per operation',
      labelNames: ['operation'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
    }),
    makeCounterProvider({
      name: 'inventory_occ_retries_total',
      help: 'OCC version conflict retries',
    }),
    makeCounterProvider({
      name: 'inventory_reservation_expiry_total',
      help: 'Reservations auto-expired by worker',
    }),
    makeCounterProvider({
      name: 'inventory_cache_hits_total',
      help: 'Redis cache hits',
    }),
    makeCounterProvider({
      name: 'inventory_cache_misses_total',
      help: 'Redis cache misses',
    }),
  ],
  exports: [InventoryMetricsService],
})
export class InventoryMetricsModule {}

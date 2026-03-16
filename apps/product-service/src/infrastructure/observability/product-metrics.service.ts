import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry } from 'prom-client';

@Injectable()
export class ProductMetricsService {
  private readonly registry: Registry;
  private readonly productsCreatedTotal: Counter;
  private readonly productsUpdatedTotal: Counter;
  private readonly productsDeletedTotal: Counter;
  private readonly cacheHitsTotal: Counter;
  private readonly cacheMissesTotal: Counter;
  private readonly statusChangesTotal: Counter;
  private readonly queryDuration: Histogram;

  constructor() {
    this.registry = new Registry();

    this.productsCreatedTotal = new Counter({
      name: 'products_created_total',
      help: 'Total number of products created',
      registers: [this.registry],
    });

    this.productsUpdatedTotal = new Counter({
      name: 'products_updated_total',
      help: 'Total number of products updated',
      registers: [this.registry],
    });

    this.productsDeletedTotal = new Counter({
      name: 'products_deleted_total',
      help: 'Total number of products deleted',
      registers: [this.registry],
    });

    this.cacheHitsTotal = new Counter({
      name: 'product_cache_hits_total',
      help: 'Total product cache hits',
      registers: [this.registry],
    });

    this.cacheMissesTotal = new Counter({
      name: 'product_cache_misses_total',
      help: 'Total product cache misses',
      registers: [this.registry],
    });

    this.statusChangesTotal = new Counter({
      name: 'product_status_changes_total',
      help: 'Total product status changes',
      labelNames: ['from_status', 'to_status'],
      registers: [this.registry],
    });

    this.queryDuration = new Histogram({
      name: 'product_query_duration_seconds',
      help: 'Product query duration in seconds',
      labelNames: ['operation'],
      buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [this.registry],
    });
  }

  incrementProductsCreated(): void {
    this.productsCreatedTotal.inc();
  }

  incrementProductsUpdated(): void {
    this.productsUpdatedTotal.inc();
  }

  incrementProductsDeleted(): void {
    this.productsDeletedTotal.inc();
  }

  incrementCacheHit(): void {
    this.cacheHitsTotal.inc();
  }

  incrementCacheMiss(): void {
    this.cacheMissesTotal.inc();
  }

  recordStatusChange(fromStatus: string, toStatus: string): void {
    this.statusChangesTotal.inc({ from_status: fromStatus, to_status: toStatus });
  }

  startTimer(operation: string): () => void {
    return this.queryDuration.startTimer({ operation });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}

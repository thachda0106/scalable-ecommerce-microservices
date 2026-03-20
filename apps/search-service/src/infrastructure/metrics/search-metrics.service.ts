import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from 'prom-client';

@Injectable()
export class SearchMetricsService implements OnModuleInit {
  private readonly registry: Registry;

  public readonly searchQueries: Counter;
  public readonly searchLatency: Histogram;
  public readonly indexOperations: Counter;
  public readonly cacheOperations: Counter;

  constructor() {
    this.registry = new Registry();

    this.searchQueries = new Counter({
      name: 'search_queries_total',
      help: 'Total number of search queries',
      labelNames: ['status'] as const,
      registers: [this.registry],
    });

    this.searchLatency = new Histogram({
      name: 'search_latency_seconds',
      help: 'Search query latency in seconds',
      labelNames: ['type'] as const,
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });

    this.indexOperations = new Counter({
      name: 'index_operations_total',
      help: 'Total number of index operations',
      labelNames: ['operation', 'status'] as const,
      registers: [this.registry],
    });

    this.cacheOperations = new Counter({
      name: 'cache_operations_total',
      help: 'Total number of cache operations',
      labelNames: ['operation', 'result'] as const,
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  recordSearch(
    type: 'search' | 'suggest' | 'get',
    durationMs: number,
    cacheHit: boolean,
  ): void {
    this.searchQueries.inc({ status: cacheHit ? 'hit' : 'miss' });
    this.searchLatency.observe({ type }, durationMs / 1000);
  }

  recordIndex(operation: 'index' | 'bulk' | 'delete', success: boolean): void {
    this.indexOperations.inc({
      operation,
      status: success ? 'success' : 'failure',
    });
  }

  recordCacheOp(
    operation: 'get' | 'set',
    result: 'hit' | 'miss' | 'error',
  ): void {
    this.cacheOperations.inc({ operation, result });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}

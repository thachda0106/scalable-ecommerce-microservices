import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';

@Injectable()
export class InventoryMetricsService {
  constructor(
    @InjectMetric('inventory_reservations_total')
    public readonly reservationsTotal: Counter,
    @InjectMetric('inventory_releases_total')
    public readonly releasesTotal: Counter,
    @InjectMetric('inventory_confirmations_total')
    public readonly confirmationsTotal: Counter,
    @InjectMetric('inventory_oversell_attempts_total')
    public readonly oversellAttempts: Counter,
    @InjectMetric('inventory_operation_duration_seconds')
    public readonly operationDuration: Histogram,
    @InjectMetric('inventory_occ_retries_total')
    public readonly occRetries: Counter,
    @InjectMetric('inventory_reservation_expiry_total')
    public readonly reservationExpiry: Counter,
    @InjectMetric('inventory_cache_hits_total')
    public readonly cacheHits: Counter,
    @InjectMetric('inventory_cache_misses_total')
    public readonly cacheMisses: Counter,
  ) {}
}

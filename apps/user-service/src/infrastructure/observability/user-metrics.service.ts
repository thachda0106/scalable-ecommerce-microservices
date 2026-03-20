import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge, Registry } from 'prom-client';

@Injectable()
export class UserMetricsService {
  private readonly registry: Registry;
  private readonly usersCreatedTotal: Counter;
  private readonly usersUpdatedTotal: Counter;
  private readonly usersDeletedTotal: Counter;
  private readonly usersSuspendedTotal: Counter;
  private readonly usersReactivatedTotal: Counter;
  private readonly userStatusChangesTotal: Counter;
  private readonly userOperationDuration: Histogram;
  private readonly activeUsersGauge: Gauge;

  constructor() {
    this.registry = new Registry();

    this.usersCreatedTotal = new Counter({
      name: 'users_created_total',
      help: 'Total number of users created',
      registers: [this.registry],
    });

    this.usersUpdatedTotal = new Counter({
      name: 'users_updated_total',
      help: 'Total number of user updates',
      labelNames: ['field'],
      registers: [this.registry],
    });

    this.usersDeletedTotal = new Counter({
      name: 'users_deleted_total',
      help: 'Total number of users soft-deleted',
      registers: [this.registry],
    });

    this.usersSuspendedTotal = new Counter({
      name: 'users_suspended_total',
      help: 'Total number of users suspended',
      registers: [this.registry],
    });

    this.usersReactivatedTotal = new Counter({
      name: 'users_reactivated_total',
      help: 'Total number of users reactivated',
      registers: [this.registry],
    });

    this.userStatusChangesTotal = new Counter({
      name: 'user_status_changes_total',
      help: 'Total number of user status changes',
      labelNames: ['from_status', 'to_status'],
      registers: [this.registry],
    });

    this.userOperationDuration = new Histogram({
      name: 'user_operation_duration_seconds',
      help: 'User operation duration in seconds',
      labelNames: ['operation'],
      buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [this.registry],
    });

    this.activeUsersGauge = new Gauge({
      name: 'active_users',
      help: 'Number of active users',
      registers: [this.registry],
    });
  }

  incrementUsersCreated(): void {
    this.usersCreatedTotal.inc();
  }

  incrementUsersUpdated(field: string): void {
    this.usersUpdatedTotal.inc({ field });
  }

  incrementUsersDeleted(): void {
    this.usersDeletedTotal.inc();
  }

  incrementUsersSuspended(): void {
    this.usersSuspendedTotal.inc();
  }

  incrementUsersReactivated(): void {
    this.usersReactivatedTotal.inc();
  }

  recordStatusChange(fromStatus: string, toStatus: string): void {
    this.userStatusChangesTotal.inc({
      from_status: fromStatus,
      to_status: toStatus,
    });
  }

  startTimer(operation: string): () => void {
    return this.userOperationDuration.startTimer({ operation });
  }

  setActiveUsers(count: number): void {
    this.activeUsersGauge.set(count);
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}

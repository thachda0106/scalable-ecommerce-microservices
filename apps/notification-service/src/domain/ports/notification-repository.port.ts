import { Notification } from '../entities/notification';

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');

export interface INotificationRepository {
  save(notification: Notification): Promise<void>;
  findById(id: string): Promise<Notification | null>;
  findByCorrelationId(correlationId: string): Promise<Notification[]>;
  findPendingRetries(limit: number): Promise<Notification[]>;
  findFailedForDlq(limit: number): Promise<Notification[]>;
}

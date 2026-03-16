import { Notification } from '../entities/notification';

export const DLQ_PUBLISHER = Symbol('DLQ_PUBLISHER');

export interface IDlqPublisher {
  /**
   * Publishes a failed notification to the Dead Letter Queue.
   */
  publish(notification: Notification): Promise<void>;
}

import { Notification } from '../notification';
import { NotificationChannel } from '../../enums/notification-channel.enum';
import { NotificationStatus } from '../../enums/notification-status.enum';
import { NotificationPriority } from '../../enums/notification-priority.enum';
import { NotificationSentEvent } from '../../events/notification-sent.event';
import { NotificationFailedEvent } from '../../events/notification-failed.event';
import { NotificationRetryScheduledEvent } from '../../events/notification-retry-scheduled.event';

const createNotification = (overrides: Record<string, unknown> = {}) =>
  Notification.create({
    recipientId: 'user-123',
    channel: NotificationChannel.EMAIL,
    templateSlug: 'order-confirmation-email',
    subject: 'Order #456 Confirmed',
    body: 'Your order is confirmed.',
    correlationId: 'correlation-abc',
    recipientEmail: 'user@example.com',
    ...overrides,
  });

describe('Notification', () => {
  describe('create', () => {
    it('should create with PENDING status', () => {
      const notification = createNotification();
      expect(notification.status).toBe(NotificationStatus.PENDING);
    });

    it('should set attempt to 0', () => {
      const notification = createNotification();
      expect(notification.attempt).toBe(0);
    });

    it('should set maxRetries to 3 by default', () => {
      const notification = createNotification();
      expect(notification.maxRetries).toBe(3);
    });

    it('should generate a UUID id', () => {
      const notification = createNotification();
      expect(notification.id).toBeDefined();
      expect(notification.id.length).toBeGreaterThan(0);
    });

    it('should use NORMAL priority by default', () => {
      const notification = createNotification();
      expect(notification.priority).toBe(NotificationPriority.NORMAL);
    });

    it('should accept custom priority', () => {
      const notification = createNotification({
        priority: NotificationPriority.HIGH,
      });
      expect(notification.priority).toBe(NotificationPriority.HIGH);
    });
  });

  describe('markSent', () => {
    it('should set status to SENT', () => {
      const notification = createNotification();
      notification.markSent();
      expect(notification.status).toBe(NotificationStatus.SENT);
    });

    it('should set sentAt timestamp', () => {
      const notification = createNotification();
      notification.markSent();
      expect(notification.toJSON().sentAt).toBeDefined();
    });

    it('should emit NotificationSentEvent', () => {
      const notification = createNotification();
      notification.markSent();
      const events = notification.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(NotificationSentEvent);
    });
  });

  describe('markFailed', () => {
    it('should set status to RETRYING when attempt < maxRetries', () => {
      const notification = createNotification();
      notification.markFailed('Timeout');
      expect(notification.status).toBe(NotificationStatus.RETRYING);
      expect(notification.attempt).toBe(1);
      expect(notification.toJSON().nextRetryAt).toBeDefined();
    });

    it('should calculate exponential backoff for nextRetryAt', () => {
      const notification = createNotification();
      notification.markFailed('Timeout');
      const retry1 = notification.toJSON().nextRetryAt!;

      notification.markFailed('Timeout');
      const retry2 = notification.toJSON().nextRetryAt!;

      expect(new Date(retry2).getTime()).toBeGreaterThan(
        new Date(retry1).getTime(),
      );
    });

    it('should set status to FAILED when attempt >= maxRetries', () => {
      const notification = createNotification({ maxRetries: 2 });
      notification.markFailed('Fail 1'); // attempt 1 → RETRYING
      notification.markFailed('Fail 2'); // attempt 2 >= maxRetries → FAILED
      expect(notification.status).toBe(NotificationStatus.FAILED);
    });

    it('should emit NotificationRetryScheduledEvent when retrying', () => {
      const notification = createNotification();
      notification.markFailed('Timeout');
      const events = notification.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(NotificationRetryScheduledEvent);
    });

    it('should emit NotificationFailedEvent when max retries exhausted', () => {
      const notification = createNotification({ maxRetries: 1 });
      notification.markFailed('Final failure');
      const events = notification.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(NotificationFailedEvent);
    });
  });

  describe('markDlq', () => {
    it('should set status to DLQ when current status is FAILED', () => {
      const notification = createNotification({ maxRetries: 1 });
      notification.markFailed('Fail');
      notification.pullEvents(); // clear events
      notification.markDlq();
      expect(notification.status).toBe(NotificationStatus.DLQ);
    });

    it('should throw when status is not FAILED', () => {
      const notification = createNotification();
      expect(() => notification.markDlq()).toThrow();
    });
  });

  describe('pullEvents', () => {
    it('should return events and clear buffer', () => {
      const notification = createNotification();
      notification.markSent();
      const firstPull = notification.pullEvents();
      expect(firstPull).toHaveLength(1);

      const secondPull = notification.pullEvents();
      expect(secondPull).toHaveLength(0);
    });
  });

  describe('toJSON', () => {
    it('should serialize all fields', () => {
      const notification = createNotification();
      const json = notification.toJSON();
      expect(json.id).toBeDefined();
      expect(json.recipientId).toBe('user-123');
      expect(json.channel).toBe(NotificationChannel.EMAIL);
      expect(json.status).toBe(NotificationStatus.PENDING);
      expect(json.createdAt).toBeDefined();
    });
  });
});

import { RetryNotificationHandler } from '../retry-notification.handler';
import { RetryNotificationCommand } from '../../commands/retry-notification.command';
import { Notification } from '../../../domain/entities/notification';
import { NotificationChannel } from '../../../domain/enums/notification-channel.enum';
import { NotificationStatus } from '../../../domain/enums/notification-status.enum';
import { INotificationRepository } from '../../../domain/ports/notification-repository.port';
import {
  IChannelProviderFactory,
  IChannelProvider,
} from '../../../domain/ports/channel-provider.port';
import { IEventPublisher } from '../../../domain/ports/event-publisher.port';

describe('RetryNotificationHandler', () => {
  let handler: RetryNotificationHandler;
  let mockNotificationRepo: jest.Mocked<INotificationRepository>;
  let mockProviderFactory: jest.Mocked<IChannelProviderFactory>;
  let mockEventPublisher: jest.Mocked<IEventPublisher>;
  let mockProvider: jest.Mocked<IChannelProvider>;

  beforeEach(() => {
    mockNotificationRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByCorrelationId: jest.fn(),
      findPendingRetries: jest.fn(),
      findFailedForDlq: jest.fn(),
    };
    mockProvider = {
      channel: NotificationChannel.EMAIL,
      send: jest.fn(),
    };
    mockProviderFactory = {
      getProvider: jest.fn().mockReturnValue(mockProvider),
    };
    mockEventPublisher = {
      publish: jest.fn(),
      publishBatch: jest.fn(),
    };

    handler = new RetryNotificationHandler(
      mockNotificationRepo,
      mockProviderFactory,
      mockEventPublisher,
    );
  });

  it('should re-dispatch and mark SENT on successful retry', async () => {
    const notification = Notification.create({
      recipientId: 'user-1',
      channel: NotificationChannel.EMAIL,
      templateSlug: 'test',
      subject: 'Test',
      body: 'Test body',
      correlationId: 'corr-1',
      recipientEmail: 'user@example.com',
    });
    notification.markFailed('first failure'); // attempt 1 → RETRYING

    mockNotificationRepo.findById.mockResolvedValue(notification);
    mockProvider.send.mockResolvedValue({
      success: true,
      providerMessageId: 'retry-success',
    });
    mockNotificationRepo.save.mockResolvedValue();
    mockEventPublisher.publishBatch.mockResolvedValue();

    const result = await handler.execute(
      new RetryNotificationCommand(notification.id),
    );

    expect(result.status).toBe(NotificationStatus.SENT);
    expect(mockProvider.send).toHaveBeenCalled();
    expect(mockNotificationRepo.save).toHaveBeenCalled();
  });

  it('should throw when notification not found', async () => {
    mockNotificationRepo.findById.mockResolvedValue(null);

    await expect(
      handler.execute(new RetryNotificationCommand('non-existent')),
    ).rejects.toThrow('not found');
  });
});

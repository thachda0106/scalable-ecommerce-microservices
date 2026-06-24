import { SendNotificationHandler } from '../send-notification.handler';
import { SendNotificationCommand } from '../../commands/send-notification.command';
import { NotificationChannel } from '../../../domain/enums/notification-channel.enum';
import { NotificationStatus } from '../../../domain/enums/notification-status.enum';
import { NotificationTemplate } from '../../../domain/entities/notification-template';
import { ITemplateRepository } from '../../../domain/ports/template-repository.port';
import { INotificationRepository } from '../../../domain/ports/notification-repository.port';
import {
  IChannelProviderFactory,
  IChannelProvider,
} from '../../../domain/ports/channel-provider.port';
import { IEventPublisher } from '../../../domain/ports/event-publisher.port';
import { TemplateNotFoundError } from '../../../domain/errors/template-not-found.error';

describe('SendNotificationHandler', () => {
  let handler: SendNotificationHandler;
  let mockTemplateRepo: jest.Mocked<ITemplateRepository>;
  let mockNotificationRepo: jest.Mocked<INotificationRepository>;
  let mockProviderFactory: jest.Mocked<IChannelProviderFactory>;
  let mockEventPublisher: jest.Mocked<IEventPublisher>;
  let mockProvider: jest.Mocked<IChannelProvider>;
  const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

  beforeEach(() => {
    mockTemplateRepo = {
      findBySlug: jest.fn(),
      findAll: jest.fn(),
      save: jest.fn(),
    };
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

    handler = new SendNotificationHandler(
      mockLogger as any,
      mockTemplateRepo,
      mockProviderFactory,
      mockNotificationRepo,
      mockEventPublisher,
    );
  });

  const createCommand = () =>
    new SendNotificationCommand(
      'user-1',
      NotificationChannel.EMAIL,
      'order-confirmation-email',
      { orderId: '123', totalAmount: '99' },
      'corr-1',
      undefined,
      'user@example.com',
    );

  it('should resolve template, render, dispatch, and persist', async () => {
    const template = NotificationTemplate.create({
      slug: 'order-confirmation-email',
      name: 'Order Confirmation',
      channel: NotificationChannel.EMAIL,
      subjectTemplate: 'Order #{{orderId}} Confirmed',
      bodyTemplate: 'Your order #{{orderId}} for ${{totalAmount}}',
      requiredVariables: ['orderId', 'totalAmount'],
    });

    mockTemplateRepo.findBySlug.mockResolvedValue(template);
    mockProvider.send.mockResolvedValue({
      success: true,
      providerMessageId: 'msg-1',
    });
    mockNotificationRepo.save.mockResolvedValue();
    mockEventPublisher.publishBatch.mockResolvedValue();

    const result = await handler.execute(createCommand());

    expect(mockTemplateRepo.findBySlug).toHaveBeenCalledWith(
      'order-confirmation-email',
    );
    expect(mockProvider.send).toHaveBeenCalled();
    expect(mockNotificationRepo.save).toHaveBeenCalled();
    expect(mockEventPublisher.publishBatch).toHaveBeenCalled();
    expect(result.status).toBe(NotificationStatus.SENT);
    expect(result.subject).toBe('Order #123 Confirmed');
  });

  it('should throw TemplateNotFoundError when template does not exist', async () => {
    mockTemplateRepo.findBySlug.mockResolvedValue(null);

    await expect(handler.execute(createCommand())).rejects.toThrow(
      TemplateNotFoundError,
    );
  });

  it('should mark notification as RETRYING when provider delivery fails', async () => {
    const template = NotificationTemplate.create({
      slug: 'order-confirmation-email',
      name: 'Order Confirmation',
      channel: NotificationChannel.EMAIL,
      subjectTemplate: 'Order #{{orderId}}',
      bodyTemplate: 'Order {{orderId}} for ${{totalAmount}}',
      requiredVariables: ['orderId', 'totalAmount'],
    });

    mockTemplateRepo.findBySlug.mockResolvedValue(template);
    mockProvider.send.mockResolvedValue({
      success: false,
      errorMessage: 'Provider timeout',
    });
    mockNotificationRepo.save.mockResolvedValue();
    mockEventPublisher.publishBatch.mockResolvedValue();

    const result = await handler.execute(createCommand());

    expect(result.status).toBe(NotificationStatus.RETRYING);
    expect(result.nextRetryAt).toBeDefined();
  });
});

import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import { kafkaConfig } from '../../infrastructure/kafka/kafka.config';
import { MoveToDlqCommand } from '../commands/move-to-dlq.command';
import { NotificationStatus } from '../../domain/enums/notification-status.enum';
import {
  NOTIFICATION_REPOSITORY,
  INotificationRepository,
} from '../../domain/ports/notification-repository.port';
import {
  EVENT_PUBLISHER,
  IEventPublisher,
} from '../../domain/ports/event-publisher.port';

@CommandHandler(MoveToDlqCommand)
export class MoveToDlqHandler implements ICommandHandler<MoveToDlqCommand>, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MoveToDlqHandler.name);
  private readonly kafka: Kafka;
  private readonly producer: Producer;

  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepo: INotificationRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {
    this.kafka = new Kafka({
      clientId: kafkaConfig.clientId,
      brokers: kafkaConfig.brokers,
    });
    this.producer = this.kafka.producer();
  }

  async onModuleInit() {
    try {
      await this.producer.connect();
    } catch (err) {
      this.logger.warn(`DLQ Kafka producer connect failed: ${err}`);
    }
  }

  async onModuleDestroy() {
    try {
      await this.producer.disconnect();
    } catch {
      // ignore
    }
  }

  async execute(cmd: MoveToDlqCommand) {
    const notification = await this.notificationRepo.findById(
      cmd.notificationId,
    );
    if (!notification) {
      throw new Error(`Notification ${cmd.notificationId} not found`);
    }

    if (notification.status !== NotificationStatus.FAILED) {
      this.logger.warn(
        `Notification ${cmd.notificationId} is not FAILED (status: ${notification.status}), skipping DLQ`,
      );
      return notification.toJSON();
    }

    notification.markDlq();
    await this.notificationRepo.save(notification);

    const events = notification.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    this.logger.warn(
      `Notification ${notification.id} moved to DLQ | channel: ${notification.channel} | recipient: ${notification.recipientId} | template: ${notification.templateSlug}`,
    );

    // Route to DLQ Kafka topic
    try {
      await this.producer.send({
        topic: 'notification.dlq',
        messages: [{ key: notification.id, value: JSON.stringify(notification.toJSON()) }]
      });
      this.logger.log(`Notification ${notification.id} published to notification.dlq topic`);
    } catch (err) {
      this.logger.error(`Failed to publish ${notification.id} to DLQ topic: ${err}`);
    }

    return notification.toJSON();
  }
}

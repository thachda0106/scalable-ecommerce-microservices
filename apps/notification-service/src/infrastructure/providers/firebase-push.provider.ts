import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { NotificationChannel } from '../../domain/enums/notification-channel.enum';
import {
  IChannelProvider,
  ChannelPayload,
  ChannelResult,
} from '../../domain/ports/channel-provider.port';

@Injectable()
export class FirebasePushProvider implements IChannelProvider {
  readonly channel = NotificationChannel.PUSH;

  constructor(@Inject(Logger) private readonly logger: Logger) {}

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    // Mock implementation — in production, this would call Firebase Cloud Messaging
    this.logger.log(
      `[MOCK PUSH] To: ${payload.recipientDeviceToken ?? payload.recipientId} | Title: ${payload.subject}`,
    );

    const failureRate = parseFloat(process.env.MOCK_FAILURE_RATE || '0');
    if (failureRate > 0 && Math.random() < failureRate) {
      return {
        success: false,
        errorMessage: 'Simulated FCM delivery failure',
      };
    }

    return {
      success: true,
      providerMessageId: `fcm-mock-${crypto.randomUUID()}`,
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '../../domain/enums/notification-channel.enum';
import {
  IChannelProvider,
  ChannelPayload,
  ChannelResult,
} from '../../domain/ports/channel-provider.port';

@Injectable()
export class FirebasePushProvider implements IChannelProvider {
  readonly channel = NotificationChannel.PUSH;
  private readonly logger = new Logger(FirebasePushProvider.name);

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

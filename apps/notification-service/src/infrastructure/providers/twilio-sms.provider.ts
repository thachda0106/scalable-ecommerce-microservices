import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '../../../domain/enums/notification-channel.enum';
import {
  IChannelProvider,
  ChannelPayload,
  ChannelResult,
} from '../../../domain/ports/channel-provider.port';

@Injectable()
export class TwilioSmsProvider implements IChannelProvider {
  readonly channel = NotificationChannel.SMS;
  private readonly logger = new Logger(TwilioSmsProvider.name);

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    // Mock implementation — in production, this would call Twilio API
    this.logger.log(
      `[MOCK SMS] To: ${payload.recipientPhone ?? payload.recipientId} | Message: ${payload.body.substring(0, 100)}`,
    );

    const failureRate = parseFloat(process.env.MOCK_FAILURE_RATE || '0');
    if (failureRate > 0 && Math.random() < failureRate) {
      return {
        success: false,
        errorMessage: 'Simulated Twilio delivery failure',
      };
    }

    return {
      success: true,
      providerMessageId: `twilio-mock-${crypto.randomUUID()}`,
    };
  }
}

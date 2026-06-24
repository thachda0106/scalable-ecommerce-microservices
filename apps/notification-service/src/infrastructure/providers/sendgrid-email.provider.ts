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
export class SendGridEmailProvider implements IChannelProvider {
  readonly channel = NotificationChannel.EMAIL;

  constructor(@Inject(Logger) private readonly logger: Logger) {}

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    // Mock implementation — in production, this would call SendGrid API
    this.logger.log(
      `[MOCK EMAIL] To: ${payload.recipientEmail ?? payload.recipientId} | Subject: ${payload.subject}`,
    );
    this.logger.debug(`[MOCK EMAIL BODY]\n${payload.body}`);

    // Simulate occasional failures for testing retry logic
    const failureRate = parseFloat(process.env.MOCK_FAILURE_RATE || '0');
    if (failureRate > 0 && Math.random() < failureRate) {
      return {
        success: false,
        errorMessage: 'Simulated SendGrid delivery failure',
      };
    }

    return {
      success: true,
      providerMessageId: `sg-mock-${crypto.randomUUID()}`,
    };
  }
}

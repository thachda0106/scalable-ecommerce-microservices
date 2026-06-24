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
export class InAppProvider implements IChannelProvider {
  readonly channel = NotificationChannel.IN_APP;

  constructor(@Inject(Logger) private readonly logger: Logger) {}

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    // In-app notifications are stored in the database and displayed in the UI.
    // No external provider call needed — always succeeds.
    this.logger.log(
      `[IN-APP] User: ${payload.recipientId} | ${payload.subject}`,
    );

    return {
      success: true,
      providerMessageId: `inapp-${crypto.randomUUID()}`,
    };
  }
}

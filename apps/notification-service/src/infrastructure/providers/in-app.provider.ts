import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '../../../domain/enums/notification-channel.enum';
import {
  IChannelProvider,
  ChannelPayload,
  ChannelResult,
} from '../../../domain/ports/channel-provider.port';

@Injectable()
export class InAppProvider implements IChannelProvider {
  readonly channel = NotificationChannel.IN_APP;
  private readonly logger = new Logger(InAppProvider.name);

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

import { NotificationChannel } from '../enums/notification-channel.enum';

export const CHANNEL_PROVIDER_FACTORY = Symbol('CHANNEL_PROVIDER_FACTORY');

export interface ChannelPayload {
  recipientId: string;
  recipientEmail?: string;
  recipientPhone?: string;
  recipientDeviceToken?: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelResult {
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}

export interface IChannelProvider {
  readonly channel: NotificationChannel;
  send(payload: ChannelPayload): Promise<ChannelResult>;
}

export interface IChannelProviderFactory {
  getProvider(channel: NotificationChannel): IChannelProvider;
}

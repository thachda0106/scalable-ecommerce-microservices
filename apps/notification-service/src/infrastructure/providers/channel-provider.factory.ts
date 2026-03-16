import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '../../domain/enums/notification-channel.enum';
import {
  IChannelProvider,
  IChannelProviderFactory,
} from '../../domain/ports/channel-provider.port';
import { InvalidChannelError } from '../../domain/errors/invalid-channel.error';
import { SendGridEmailProvider } from './sendgrid-email.provider';
import { TwilioSmsProvider } from './twilio-sms.provider';
import { FirebasePushProvider } from './firebase-push.provider';
import { InAppProvider } from './in-app.provider';

@Injectable()
export class ChannelProviderFactory implements IChannelProviderFactory {
  private readonly providers: Map<NotificationChannel, IChannelProvider>;

  constructor(
    emailProvider: SendGridEmailProvider,
    smsProvider: TwilioSmsProvider,
    pushProvider: FirebasePushProvider,
    inAppProvider: InAppProvider,
  ) {
    this.providers = new Map<NotificationChannel, IChannelProvider>([
      [NotificationChannel.EMAIL, emailProvider as IChannelProvider],
      [NotificationChannel.SMS, smsProvider as IChannelProvider],
      [NotificationChannel.PUSH, pushProvider as IChannelProvider],
      [NotificationChannel.IN_APP, inAppProvider as IChannelProvider],
    ]);
  }

  getProvider(channel: NotificationChannel): IChannelProvider {
    const provider = this.providers.get(channel);
    if (!provider) {
      throw new InvalidChannelError(channel);
    }
    return provider;
  }
}

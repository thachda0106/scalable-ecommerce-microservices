import { ChannelProviderFactory } from '../channel-provider.factory';
import { NotificationChannel } from '../../../domain/enums/notification-channel.enum';
import { SendGridEmailProvider } from '../sendgrid-email.provider';
import { TwilioSmsProvider } from '../twilio-sms.provider';
import { FirebasePushProvider } from '../firebase-push.provider';
import { InAppProvider } from '../in-app.provider';
import { InvalidChannelError } from '../../../domain/errors/invalid-channel.error';

describe('ChannelProviderFactory', () => {
  let factory: ChannelProviderFactory;
  let emailProvider: SendGridEmailProvider;
  let smsProvider: TwilioSmsProvider;
  let pushProvider: FirebasePushProvider;
  let inAppProvider: InAppProvider;

  beforeEach(() => {
    emailProvider = new SendGridEmailProvider();
    smsProvider = new TwilioSmsProvider();
    pushProvider = new FirebasePushProvider();
    inAppProvider = new InAppProvider();
    factory = new ChannelProviderFactory(
      emailProvider,
      smsProvider,
      pushProvider,
      inAppProvider,
    );
  });

  it('should return email provider for EMAIL channel', () => {
    const provider = factory.getProvider(NotificationChannel.EMAIL);
    expect(provider).toBe(emailProvider);
    expect(provider.channel).toBe(NotificationChannel.EMAIL);
  });

  it('should return sms provider for SMS channel', () => {
    const provider = factory.getProvider(NotificationChannel.SMS);
    expect(provider).toBe(smsProvider);
    expect(provider.channel).toBe(NotificationChannel.SMS);
  });

  it('should return push provider for PUSH channel', () => {
    const provider = factory.getProvider(NotificationChannel.PUSH);
    expect(provider).toBe(pushProvider);
    expect(provider.channel).toBe(NotificationChannel.PUSH);
  });

  it('should return in-app provider for IN_APP channel', () => {
    const provider = factory.getProvider(NotificationChannel.IN_APP);
    expect(provider).toBe(inAppProvider);
    expect(provider.channel).toBe(NotificationChannel.IN_APP);
  });

  it('should throw InvalidChannelError for unknown channel', () => {
    expect(() =>
      factory.getProvider('UNKNOWN' as NotificationChannel),
    ).toThrow(InvalidChannelError);
  });
});

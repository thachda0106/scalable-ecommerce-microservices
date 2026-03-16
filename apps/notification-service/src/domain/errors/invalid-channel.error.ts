export class InvalidChannelError extends Error {
  constructor(public readonly channel: string) {
    super(`Invalid notification channel: ${channel}`);
    this.name = 'InvalidChannelError';
  }
}

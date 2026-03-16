export class NotificationDeliveryFailedError extends Error {
  constructor(
    public readonly notificationId: string,
    public readonly channel: string,
    public readonly reason: string,
    public readonly attempt: number,
  ) {
    super(
      `Notification ${notificationId} delivery failed via ${channel} on attempt ${attempt}: ${reason}`,
    );
    this.name = 'NotificationDeliveryFailedError';
  }
}

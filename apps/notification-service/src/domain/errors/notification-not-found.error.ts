export class NotificationNotFoundError extends Error {
  constructor(public readonly notificationId: string) {
    super(`Notification not found: ${notificationId}`);
    this.name = 'NotificationNotFoundError';
  }
}

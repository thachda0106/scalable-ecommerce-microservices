export class UserDeactivatedEvent {
  public readonly occurredAt = new Date().toISOString();

  constructor(public readonly userId: string) {}
}

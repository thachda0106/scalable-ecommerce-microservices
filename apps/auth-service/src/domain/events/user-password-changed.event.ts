export class UserPasswordChangedEvent {
  public readonly occurredAt = new Date().toISOString();

  constructor(public readonly userId: string) {}
}

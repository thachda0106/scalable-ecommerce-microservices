export class UserRegisteredEvent {
  public readonly occurredAt = new Date().toISOString();

  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly provider?: string,
  ) {}
}

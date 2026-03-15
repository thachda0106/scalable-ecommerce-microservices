export class UserLoginFailedEvent {
  public readonly occurredAt = new Date().toISOString();

  constructor(
    public readonly email: string,
    public readonly reason: string,
    public readonly ip?: string,
  ) {}
}

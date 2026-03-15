export class UserLoggedInEvent {
  public readonly occurredAt = new Date().toISOString();

  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly ip?: string,
    public readonly userAgent?: string,
  ) {}
}

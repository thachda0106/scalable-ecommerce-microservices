import { BaseDomainEvent } from './base-domain.event';

export class UserCreatedEvent extends BaseDomainEvent {
  public readonly eventType = 'user.created';

  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly username: string,
  ) {
    super();
  }
}

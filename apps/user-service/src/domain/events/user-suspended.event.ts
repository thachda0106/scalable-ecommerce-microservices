import { BaseDomainEvent } from './base-domain.event';

export class UserSuspendedEvent extends BaseDomainEvent {
  public readonly eventType = 'user.suspended';

  constructor(
    public readonly userId: string,
    public readonly reason: string,
  ) {
    super();
  }
}

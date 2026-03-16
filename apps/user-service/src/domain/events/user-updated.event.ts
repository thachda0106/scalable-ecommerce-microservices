import { BaseDomainEvent } from './base-domain.event';

export class UserUpdatedEvent extends BaseDomainEvent {
  public readonly eventType = 'user.updated';

  constructor(
    public readonly userId: string,
    public readonly changedFields: string[],
  ) {
    super();
  }
}

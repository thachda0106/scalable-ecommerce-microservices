import { BaseDomainEvent } from './base-domain.event';

export class UserDeletedEvent extends BaseDomainEvent {
  public readonly eventType = 'user.deleted';

  constructor(public readonly userId: string) {
    super();
  }
}

import { BaseDomainEvent } from './base-domain.event';

export class UserReactivatedEvent extends BaseDomainEvent {
  public readonly eventType = 'user.reactivated';

  constructor(public readonly userId: string) {
    super();
  }
}

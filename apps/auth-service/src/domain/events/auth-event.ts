import { IDomainEvent } from '@ecommerce/core';
import { randomUUID } from 'crypto';

export class AuthEvent implements IDomainEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredOn: Date;

  constructor(eventType: string, public readonly data: Record<string, unknown>) {
    this.eventId = randomUUID();
    this.eventType = eventType;
    this.occurredOn = new Date();
  }
}

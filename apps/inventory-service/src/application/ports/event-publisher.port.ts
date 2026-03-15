import { BaseDomainEvent } from '../../domain/events/base-domain.event';

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

export interface IEventPublisher {
  publish(event: BaseDomainEvent): Promise<void>;
  publishBatch(events: BaseDomainEvent[]): Promise<void>;
}

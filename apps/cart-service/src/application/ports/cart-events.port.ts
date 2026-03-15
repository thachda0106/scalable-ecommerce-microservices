import { BaseDomainEvent } from '../../domain/events/base-domain.event';

export const CART_EVENTS_PRODUCER = Symbol('CART_EVENTS_PRODUCER');

export interface ICartEventsProducer {
  publish(event: BaseDomainEvent): Promise<void>;
}

import { BaseDomainEvent } from '../../domain/events/base-domain.event';

export const CART_OUTBOX = Symbol('CART_OUTBOX');

/**
 * Port for the transactional outbox.
 * Events are durably stored and later relayed to Kafka by a background worker.
 */
export interface ICartOutbox {
  append(events: BaseDomainEvent[]): Promise<void>;
}

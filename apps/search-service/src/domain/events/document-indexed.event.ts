import { BaseDomainEvent } from './base-domain.event';

export class DocumentIndexedEvent extends BaseDomainEvent {
  public readonly eventType = 'document.indexed';

  constructor(public readonly documentId: string) {
    super();
  }
}

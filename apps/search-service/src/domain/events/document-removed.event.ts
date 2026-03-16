import { BaseDomainEvent } from './base-domain.event';

export class DocumentRemovedEvent extends BaseDomainEvent {
  public readonly eventType = 'document.removed';

  constructor(public readonly documentId: string) {
    super();
  }
}

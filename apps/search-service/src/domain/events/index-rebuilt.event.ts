import { BaseDomainEvent } from './base-domain.event';

export class IndexRebuiltEvent extends BaseDomainEvent {
  public readonly eventType = 'index.rebuilt';

  constructor(
    public readonly totalDocuments: number,
    public readonly durationMs: number,
  ) {
    super();
  }
}

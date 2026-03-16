export abstract class BaseDomainEvent {
  public readonly eventId: string;
  public readonly occurredOn: Date;
  public abstract readonly eventType: string;

  constructor() {
    this.eventId = crypto.randomUUID();
    this.occurredOn = new Date();
  }
}

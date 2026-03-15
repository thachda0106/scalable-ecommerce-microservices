export abstract class BaseDomainEvent {
  public readonly eventId: string = crypto.randomUUID();
  public readonly occurredOn: Date = new Date();
  public abstract readonly eventType: string;
  public abstract readonly userId: string;
}

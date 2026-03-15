export abstract class BaseDomainEvent {
  public readonly occurredOn: Date = new Date();
  public abstract readonly eventType: string;
}

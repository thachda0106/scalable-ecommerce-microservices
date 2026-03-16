export abstract class BaseDomainEvent {
  readonly occurredOn: Date;

  constructor() {
    this.occurredOn = new Date();
  }

  abstract get eventType(): string;
}

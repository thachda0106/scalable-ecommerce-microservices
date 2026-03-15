export enum MovementType {
  RESERVE = 'RESERVE',
  RELEASE = 'RELEASE',
  CONFIRM = 'CONFIRM',
  REPLENISH = 'REPLENISH',
  EXPIRE = 'EXPIRE',
  ADJUSTMENT = 'ADJUSTMENT',
}

export interface CreateMovementProps {
  productId: string;
  movementType: MovementType;
  quantity: number;
  referenceId: string;
  previousAvailable: number;
  newAvailable: number;
  previousReserved: number;
  newReserved: number;
  reason: string;
  performedBy: string;
  correlationId: string;
}

export class StockMovement {
  readonly id: string;
  readonly productId: string;
  readonly movementType: MovementType;
  readonly quantity: number;
  readonly referenceId: string;
  readonly previousAvailable: number;
  readonly newAvailable: number;
  readonly previousReserved: number;
  readonly newReserved: number;
  readonly reason: string;
  readonly performedBy: string;
  readonly correlationId: string;
  readonly createdAt: Date;

  private constructor(props: CreateMovementProps & { id: string; createdAt: Date }) {
    this.id = props.id;
    this.productId = props.productId;
    this.movementType = props.movementType;
    this.quantity = props.quantity;
    this.referenceId = props.referenceId;
    this.previousAvailable = props.previousAvailable;
    this.newAvailable = props.newAvailable;
    this.previousReserved = props.previousReserved;
    this.newReserved = props.newReserved;
    this.reason = props.reason;
    this.performedBy = props.performedBy;
    this.correlationId = props.correlationId;
    this.createdAt = props.createdAt;
  }

  static create(props: CreateMovementProps): StockMovement {
    return new StockMovement({
      ...props,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    });
  }

  static reconstitute(
    props: CreateMovementProps & { id: string; createdAt: Date },
  ): StockMovement {
    return new StockMovement(props);
  }

  toJSON() {
    return {
      id: this.id,
      productId: this.productId,
      movementType: this.movementType,
      quantity: this.quantity,
      referenceId: this.referenceId,
      previousAvailable: this.previousAvailable,
      newAvailable: this.newAvailable,
      previousReserved: this.previousReserved,
      newReserved: this.newReserved,
      reason: this.reason,
      performedBy: this.performedBy,
      correlationId: this.correlationId,
      createdAt: this.createdAt.toISOString(),
    };
  }
}

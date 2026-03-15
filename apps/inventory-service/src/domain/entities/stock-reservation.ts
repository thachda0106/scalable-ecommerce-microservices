import { ReservationStatus } from '../value-objects/reservation-status.vo';

export interface CreateReservationProps {
  productId: string;
  referenceId: string;
  referenceType: 'CART' | 'ORDER';
  quantity: number;
  ttlMinutes: number;
  idempotencyKey: string;
}

export interface ReconstitueReservationProps {
  id: string;
  productId: string;
  referenceId: string;
  referenceType: 'CART' | 'ORDER';
  quantity: number;
  status: ReservationStatus;
  expiresAt: Date;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export class StockReservation {
  private _id: string;
  private _productId: string;
  private _referenceId: string;
  private _referenceType: 'CART' | 'ORDER';
  private _quantity: number;
  private _status: ReservationStatus;
  private _expiresAt: Date;
  private _idempotencyKey: string;
  private _createdAt: Date;
  private _updatedAt: Date;

  private constructor() {}

  static create(props: CreateReservationProps): StockReservation {
    const reservation = new StockReservation();
    reservation._id = crypto.randomUUID();
    reservation._productId = props.productId;
    reservation._referenceId = props.referenceId;
    reservation._referenceType = props.referenceType;
    reservation._quantity = props.quantity;
    reservation._status = ReservationStatus.ACTIVE;
    reservation._expiresAt = new Date(
      Date.now() + props.ttlMinutes * 60 * 1000,
    );
    reservation._idempotencyKey = props.idempotencyKey;
    reservation._createdAt = new Date();
    reservation._updatedAt = new Date();
    return reservation;
  }

  static reconstitute(props: ReconstitueReservationProps): StockReservation {
    const reservation = new StockReservation();
    reservation._id = props.id;
    reservation._productId = props.productId;
    reservation._referenceId = props.referenceId;
    reservation._referenceType = props.referenceType;
    reservation._quantity = props.quantity;
    reservation._status = props.status;
    reservation._expiresAt = props.expiresAt;
    reservation._idempotencyKey = props.idempotencyKey;
    reservation._createdAt = props.createdAt;
    reservation._updatedAt = props.updatedAt;
    return reservation;
  }

  confirm(): void {
    this.assertActive('confirm');
    this._status = ReservationStatus.CONFIRMED;
    this._updatedAt = new Date();
  }

  release(): void {
    this.assertActive('release');
    this._status = ReservationStatus.RELEASED;
    this._updatedAt = new Date();
  }

  expire(): void {
    this.assertActive('expire');
    this._status = ReservationStatus.EXPIRED;
    this._updatedAt = new Date();
  }

  isExpired(): boolean {
    return (
      this._status === ReservationStatus.ACTIVE &&
      new Date() > this._expiresAt
    );
  }

  isActive(): boolean {
    return this._status === ReservationStatus.ACTIVE;
  }

  private assertActive(operation: string): void {
    if (this._status !== ReservationStatus.ACTIVE) {
      throw new Error(
        `Cannot ${operation} reservation ${this._id}: status is ${this._status}, expected ACTIVE`,
      );
    }
  }

  // Getters
  get id(): string {
    return this._id;
  }
  get productId(): string {
    return this._productId;
  }
  get referenceId(): string {
    return this._referenceId;
  }
  get referenceType(): 'CART' | 'ORDER' {
    return this._referenceType;
  }
  get quantity(): number {
    return this._quantity;
  }
  get status(): ReservationStatus {
    return this._status;
  }
  get expiresAt(): Date {
    return this._expiresAt;
  }
  get idempotencyKey(): string {
    return this._idempotencyKey;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  toJSON() {
    return {
      id: this._id,
      productId: this._productId,
      referenceId: this._referenceId,
      referenceType: this._referenceType,
      quantity: this._quantity,
      status: this._status,
      expiresAt: this._expiresAt.toISOString(),
      idempotencyKey: this._idempotencyKey,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }
}

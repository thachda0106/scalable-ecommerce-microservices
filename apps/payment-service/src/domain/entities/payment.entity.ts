import { PaymentId } from '../value-objects/payment-id.vo';
import { PaymentStatus, PaymentStatusEnum } from '../value-objects/payment-status.vo';
import { Money } from '../value-objects/money.vo';
import { PaymentProviderEnum } from '../enums/payment-provider.enum';
import { BaseDomainEvent } from '../events/base-domain.event';
import { PaymentCreatedEvent } from '../events/payment-created.event';
import { PaymentProcessingEvent } from '../events/payment-processing.event';
import { PaymentCompletedEvent } from '../events/payment-completed.event';
import { PaymentFailedEvent } from '../events/payment-failed.event';
import { PaymentRefundedEvent } from '../events/payment-refunded.event';
import { InvalidPaymentOperationError } from '../errors/invalid-payment-operation.error';

export interface CreatePaymentProps {
  orderId: string;
  userId: string;
  amountInCents: number;
  currency: string;
  provider: PaymentProviderEnum;
  idempotencyKey?: string;
}

export interface ReconstitutePaymentProps {
  id: string;
  orderId: string;
  userId: string;
  amountInCents: number;
  currency: string;
  status: PaymentStatusEnum;
  provider: PaymentProviderEnum;
  transactionId: string | null;
  idempotencyKey: string | null;
  failReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Payment {
  private _id: PaymentId;
  private _orderId: string;
  private _userId: string;
  private _amount: Money;
  private _status: PaymentStatus;
  private _provider: PaymentProviderEnum;
  private _transactionId: string | null;
  private _idempotencyKey: string | null;
  private _failReason: string | null;
  private _createdAt: Date;
  private _updatedAt: Date;
  private _domainEvents: BaseDomainEvent[] = [];

  private constructor() {}

  static create(props: CreatePaymentProps): Payment {
    if (props.amountInCents <= 0) {
      throw new InvalidPaymentOperationError(
        'createPayment',
        'Payment amount must be greater than zero',
      );
    }

    const payment = new Payment();
    payment._id = PaymentId.generate();
    payment._orderId = props.orderId;
    payment._userId = props.userId;
    payment._amount = Money.fromCents(props.amountInCents, props.currency);
    payment._status = PaymentStatus.pending();
    payment._provider = props.provider;
    payment._transactionId = null;
    payment._idempotencyKey = props.idempotencyKey ?? null;
    payment._failReason = null;
    payment._createdAt = new Date();
    payment._updatedAt = new Date();

    payment._domainEvents.push(
      new PaymentCreatedEvent(
        payment._id.value,
        payment._orderId,
        payment._userId,
        payment._amount.amountInCents,
        payment._amount.currency,
        payment._provider,
      ),
    );

    return payment;
  }

  static reconstitute(props: ReconstitutePaymentProps): Payment {
    const payment = new Payment();
    payment._id = PaymentId.create(props.id);
    payment._orderId = props.orderId;
    payment._userId = props.userId;
    payment._amount = Money.fromCents(props.amountInCents, props.currency);
    payment._status = PaymentStatus.create(props.status);
    payment._provider = props.provider;
    payment._transactionId = props.transactionId;
    payment._idempotencyKey = props.idempotencyKey;
    payment._failReason = props.failReason;
    payment._createdAt = props.createdAt;
    payment._updatedAt = props.updatedAt;
    return payment;
  }

  // ─── Domain Behaviors ─────────────────────────────────────────────────

  startProcessing(): void {
    this._status = this._status.transitionTo(PaymentStatusEnum.PROCESSING);
    this._updatedAt = new Date();

    this._domainEvents.push(
      new PaymentProcessingEvent(
        this._id.value,
        this._orderId,
        this._provider,
      ),
    );
  }

  complete(transactionId: string): void {
    this._status = this._status.transitionTo(PaymentStatusEnum.SUCCESS);
    this._transactionId = transactionId;
    this._updatedAt = new Date();

    this._domainEvents.push(
      new PaymentCompletedEvent(
        this._id.value,
        this._orderId,
        transactionId,
        this._amount.amountInCents,
        this._amount.currency,
      ),
    );
  }

  fail(reason: string): void {
    this._status = this._status.transitionTo(PaymentStatusEnum.FAILED);
    this._failReason = reason;
    this._updatedAt = new Date();

    this._domainEvents.push(
      new PaymentFailedEvent(
        this._id.value,
        this._orderId,
        reason,
      ),
    );
  }

  refund(reason: string): void {
    this._status = this._status.transitionTo(PaymentStatusEnum.REFUNDED);
    this._updatedAt = new Date();

    this._domainEvents.push(
      new PaymentRefundedEvent(
        this._id.value,
        this._orderId,
        this._amount.amountInCents,
        this._amount.currency,
        reason,
      ),
    );
  }

  // ─── Event Handling ──────────────────────────────────────────────────

  pullDomainEvents(): BaseDomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  // ─── Getters ─────────────────────────────────────────────────────────

  get id(): PaymentId {
    return this._id;
  }

  get orderId(): string {
    return this._orderId;
  }

  get userId(): string {
    return this._userId;
  }

  get amount(): Money {
    return this._amount;
  }

  get status(): PaymentStatus {
    return this._status;
  }

  get provider(): PaymentProviderEnum {
    return this._provider;
  }

  get transactionId(): string | null {
    return this._transactionId;
  }

  get idempotencyKey(): string | null {
    return this._idempotencyKey;
  }

  get failReason(): string | null {
    return this._failReason;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  toJSON() {
    return {
      id: this._id.value,
      orderId: this._orderId,
      userId: this._userId,
      amountInCents: this._amount.amountInCents,
      currency: this._amount.currency,
      status: this._status.value,
      provider: this._provider,
      transactionId: this._transactionId,
      idempotencyKey: this._idempotencyKey,
      failReason: this._failReason,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }
}

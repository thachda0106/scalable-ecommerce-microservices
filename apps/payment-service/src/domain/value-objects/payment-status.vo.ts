import { InvalidPaymentStatusTransitionError } from '../errors/invalid-payment-status-transition.error';

export enum PaymentStatusEnum {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

const VALID_TRANSITIONS: Map<PaymentStatusEnum, PaymentStatusEnum[]> = new Map([
  [PaymentStatusEnum.PENDING, [PaymentStatusEnum.PROCESSING, PaymentStatusEnum.FAILED]],
  [PaymentStatusEnum.PROCESSING, [PaymentStatusEnum.SUCCESS, PaymentStatusEnum.FAILED]],
  [PaymentStatusEnum.SUCCESS, [PaymentStatusEnum.REFUNDED]],
  [PaymentStatusEnum.FAILED, []],
  [PaymentStatusEnum.REFUNDED, []],
]);

export class PaymentStatus {
  private readonly _value: PaymentStatusEnum;

  private constructor(value: PaymentStatusEnum) {
    this._value = value;
  }

  static create(value: PaymentStatusEnum): PaymentStatus {
    return new PaymentStatus(value);
  }

  static pending(): PaymentStatus {
    return new PaymentStatus(PaymentStatusEnum.PENDING);
  }

  get value(): PaymentStatusEnum {
    return this._value;
  }

  canTransitionTo(target: PaymentStatusEnum): boolean {
    const allowed = VALID_TRANSITIONS.get(this._value) ?? [];
    return allowed.includes(target);
  }

  transitionTo(target: PaymentStatusEnum): PaymentStatus {
    if (!this.canTransitionTo(target)) {
      throw new InvalidPaymentStatusTransitionError(this._value, target);
    }
    return new PaymentStatus(target);
  }

  isTerminal(): boolean {
    return (
      this._value === PaymentStatusEnum.FAILED ||
      this._value === PaymentStatusEnum.REFUNDED
    );
  }

  equals(other: PaymentStatus): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}

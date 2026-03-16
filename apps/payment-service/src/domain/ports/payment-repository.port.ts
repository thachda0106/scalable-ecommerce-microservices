import { Payment } from '../entities/payment.entity';
import { PaymentId } from '../value-objects/payment-id.vo';

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');

export interface IPaymentRepository {
  save(payment: Payment): Promise<void>;
  findById(id: PaymentId): Promise<Payment | null>;
  findByOrderId(orderId: string): Promise<Payment[]>;
  findByIdempotencyKey(key: string): Promise<Payment | null>;
}

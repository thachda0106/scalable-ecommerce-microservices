export const PAYMENT_SERVICE = Symbol('PAYMENT_SERVICE');

export interface IPaymentService {
  requestPayment(
    orderId: string,
    amountInCents: number,
    currency: string,
    userId: string,
  ): Promise<void>;
}

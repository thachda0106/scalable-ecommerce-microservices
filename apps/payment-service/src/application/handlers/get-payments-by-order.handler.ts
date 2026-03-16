import { Inject } from '@nestjs/common';
import { GetPaymentsByOrderQuery } from '../queries/get-payments-by-order.query';
import { PAYMENT_REPOSITORY, IPaymentRepository } from '../../domain/ports/payment-repository.port';

export class GetPaymentsByOrderHandler {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepository: IPaymentRepository,
  ) {}

  async execute(query: GetPaymentsByOrderQuery): Promise<Record<string, unknown>[]> {
    const payments = await this.paymentRepository.findByOrderId(query.orderId);
    return payments.map((p) => p.toJSON());
  }
}

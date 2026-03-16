import { Inject } from '@nestjs/common';
import { GetPaymentByIdQuery } from '../queries/get-payment-by-id.query';
import { PaymentId } from '../../domain/value-objects/payment-id.vo';
import { PAYMENT_REPOSITORY, IPaymentRepository } from '../../domain/ports/payment-repository.port';

export class GetPaymentByIdHandler {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepository: IPaymentRepository,
  ) {}

  async execute(query: GetPaymentByIdQuery): Promise<Record<string, unknown> | null> {
    const payment = await this.paymentRepository.findById(
      PaymentId.create(query.paymentId),
    );
    return payment ? payment.toJSON() : null;
  }
}

import { Payment } from '../../../domain/entities/payment.entity';
import { PaymentStatusEnum } from '../../../domain/value-objects/payment-status.vo';
import { PaymentProviderEnum } from '../../../domain/enums/payment-provider.enum';
import { PaymentOrmEntity } from '../entities/payment.orm-entity';

export class PaymentMapper {
  static toDomain(orm: PaymentOrmEntity): Payment {
    return Payment.reconstitute({
      id: orm.id,
      orderId: orm.orderId,
      userId: orm.userId,
      amountInCents: orm.amountInCents,
      currency: orm.currency,
      status: orm.status as PaymentStatusEnum,
      provider: orm.provider as PaymentProviderEnum,
      transactionId: orm.transactionId ?? null,
      idempotencyKey: orm.idempotencyKey ?? null,
      failReason: orm.failReason ?? null,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
    });
  }

  static toOrm(domain: Payment): PaymentOrmEntity {
    const orm = new PaymentOrmEntity();
    orm.id = domain.id.value;
    orm.orderId = domain.orderId;
    orm.userId = domain.userId;
    orm.amountInCents = domain.amount.amountInCents;
    orm.currency = domain.amount.currency;
    orm.status = domain.status.value;
    orm.provider = domain.provider;
    orm.transactionId = domain.transactionId ?? null;
    orm.idempotencyKey = domain.idempotencyKey ?? null;
    orm.failReason = domain.failReason ?? null;
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt;
    return orm;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../../../domain/entities/payment.entity';
import { PaymentId } from '../../../domain/value-objects/payment-id.vo';
import { IPaymentRepository } from '../../../domain/ports/payment-repository.port';
import { PaymentOrmEntity } from '../entities/payment.orm-entity';
import { PaymentMapper } from '../mappers/payment.mapper';

@Injectable()
export class TypeOrmPaymentRepository implements IPaymentRepository {
  private readonly logger = new Logger(TypeOrmPaymentRepository.name);

  constructor(
    @InjectRepository(PaymentOrmEntity)
    private readonly paymentRepo: Repository<PaymentOrmEntity>,
  ) {}

  async save(payment: Payment): Promise<void> {
    try {
      const orm = PaymentMapper.toOrm(payment);
      await this.paymentRepo.save(orm);
    } catch (error) {
      this.logger.error(`Failed to save payment: ${(error as Error).message}`);
      throw error;
    }
  }

  async findById(id: PaymentId): Promise<Payment | null> {
    const orm = await this.paymentRepo.findOneBy({ id: id.value });
    return orm ? PaymentMapper.toDomain(orm) : null;
  }

  async findByOrderId(orderId: string): Promise<Payment[]> {
    const orms = await this.paymentRepo.find({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
    return orms.map(PaymentMapper.toDomain);
  }

  async findByIdempotencyKey(key: string): Promise<Payment | null> {
    const orm = await this.paymentRepo.findOneBy({ idempotencyKey: key });
    return orm ? PaymentMapper.toDomain(orm) : null;
  }
}

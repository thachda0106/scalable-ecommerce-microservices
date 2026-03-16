import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Payment } from '../../../domain/entities/payment.entity';
import { PaymentId } from '../../../domain/value-objects/payment-id.vo';
import { IPaymentRepository } from '../../../domain/ports/payment-repository.port';
import { PaymentOrmEntity } from '../entities/payment.orm-entity';
import { OutboxEventOrmEntity } from '../entities/outbox-event.orm-entity';
import { PaymentMapper } from '../mappers/payment.mapper';

@Injectable()
export class TypeOrmPaymentRepository implements IPaymentRepository {
  private readonly logger = new Logger(TypeOrmPaymentRepository.name);

  constructor(
    @InjectRepository(PaymentOrmEntity)
    private readonly paymentRepo: Repository<PaymentOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async save(payment: Payment): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const orm = PaymentMapper.toOrm(payment);
      await queryRunner.manager.save(PaymentOrmEntity, orm);

      // Persist domain events to outbox in same transaction
      const events = payment.pullDomainEvents();
      for (const event of events) {
        const outboxEvent = new OutboxEventOrmEntity();
        outboxEvent.id = uuidv4();
        outboxEvent.type = event.eventType;
        outboxEvent.payload = this.mapEventToPayload(event);
        outboxEvent.processed = false;
        await queryRunner.manager.save(OutboxEventOrmEntity, outboxEvent);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to save payment: ${(error as Error).message}`);
      throw error;
    } finally {
      await queryRunner.release();
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

  private mapEventToPayload(event: any): Record<string, unknown> {
    // Map domain events to payload format compatible with order-service consumer
    const base = {
      paymentId: event.paymentId,
      orderId: event.orderId,
    };

    switch (event.eventType) {
      case 'PaymentCompleted':
        return {
          ...base,
          transactionId: event.transactionId,
          success: true,
          amountInCents: event.amountInCents,
          currency: event.currency,
        };
      case 'PaymentFailed':
        return {
          ...base,
          success: false,
          reason: event.reason,
        };
      case 'PaymentRefunded':
        return {
          ...base,
          amountInCents: event.amountInCents,
          currency: event.currency,
          reason: event.reason,
        };
      default:
        return { ...base, ...event };
    }
  }
}

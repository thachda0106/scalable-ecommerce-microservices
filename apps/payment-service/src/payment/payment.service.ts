import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  PaymentTransaction,
  PaymentStatus,
} from './entities/payment-transaction.entity';
import { OutboxEvent } from '../outbox/entities/outbox-event.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(PaymentTransaction)
    private paymentRepository: Repository<PaymentTransaction>,
    private dataSource: DataSource,
  ) {}

  async processPayment(orderId: string, amount: number = 0) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let success = false;
    let reason = '';
    this.logger.debug(`Processing payment of $${amount}`);

    try {
      // Mocking 3rd party processing: 90% success
      success = Math.random() < 0.9;
      reason = success ? '' : 'Payment Declined by Bank';

      const transaction = this.paymentRepository.create({
        orderId,
        status: success ? PaymentStatus.PROCESSED : PaymentStatus.FAILED,
        failReason: reason,
      });

      const savedTx = await queryRunner.manager.save(
        PaymentTransaction,
        transaction,
      );

      const outboxEvent = new OutboxEvent();
      outboxEvent.id = uuidv4();
      outboxEvent.type = success ? 'PaymentProcessed' : 'PaymentFailed';
      outboxEvent.payload = {
        orderId,
        transactionId: savedTx.id,
        success,
        reason,
      };

      await queryRunner.manager.save(OutboxEvent, outboxEvent);
      await queryRunner.commitTransaction();

      this.logger.log(
        `Payment for order ${orderId} ${success ? 'PROCESSED' : 'FAILED'}`,
      );
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Payment processing error for order ${orderId}: ${err.message}`,
      );
    } finally {
      await queryRunner.release();
    }
  }
}

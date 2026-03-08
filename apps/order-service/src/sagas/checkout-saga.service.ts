import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Kafka, Consumer } from 'kafkajs';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { OutboxEvent } from '../outbox/entities/outbox-event.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CheckoutSagaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CheckoutSagaService.name);
  private kafka: Kafka;
  private consumer: Consumer;

  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    private dataSource: DataSource,
  ) {
    const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:29092';

    this.kafka = new Kafka({
      clientId: 'order-service-saga',
      brokers: KAFKA_BROKERS.split(','),
    });
    this.consumer = this.kafka.consumer({ groupId: 'order-service-checkout-saga' });
  }

  async onModuleInit() {
    await this.consumer.connect();
    // Subscribe to both inventory and payment events for orchestration
    await this.consumer.subscribe({ topic: 'inventory.events', fromBeginning: true });
    await this.consumer.subscribe({ topic: 'payment.events', fromBeginning: true });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        if (!message.value) return;
        
        try {
          const event = JSON.parse(message.value.toString());
          await this.handleSagaEvent(event);
        } catch (error) {
          this.logger.error(`Error processing saga message: ${error.message}`);
        }
      },
    });

    this.logger.log('Saga Orchestrator connected and listening to orchestrate checkout');
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }

  private async handleSagaEvent(event: any) {
    const { type, payload } = event;
    const orderId = payload.orderId;

    if (!orderId) return;

    if (type === 'InventoryReserved') {
      // Inventory successful. In real orchestration, we might publish an explicit "ProcessPayment" command via Outbox.
      // But we already implemented choreo where Payment listens directly to InventoryReserved.
      // So Order Service just waits for Payment events.
      this.logger.log(`Order ${orderId}: Inventory reserved. Awaiting payment.`);
    } 
    else if (type === 'InventoryReservationFailed') {
      // Inventory failed, fail the order. No compensations needed as nothing else succeeded.
      await this.updateOrderStatus(orderId, OrderStatus.FAILED, 'InventoryReservationFailed');
    }
    else if (type === 'PaymentProcessed') {
      // Payment successful, order is fully confirmed!
      await this.updateOrderStatus(orderId, OrderStatus.CONFIRMED, 'OrderConfirmed');
    }
    else if (type === 'PaymentFailed') {
      // Payment failed. Fail the order AND emit a compensating OrderFailed event to rollback Inventory
      await this.updateOrderStatus(orderId, OrderStatus.FAILED, 'OrderFailed');
    }
  }

  private async updateOrderStatus(orderId: string, status: OrderStatus, eventTypeToEmit?: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const order = await queryRunner.manager.findOneBy(Order, { id: orderId });
      if (order && order.status !== status) {
        order.status = status;
        await queryRunner.manager.save(Order, order);

        if (eventTypeToEmit) {
          const outboxEvent = new OutboxEvent();
          outboxEvent.id = uuidv4();
          outboxEvent.type = eventTypeToEmit;
          outboxEvent.payload = { id: order.id, ...order };
          await queryRunner.manager.save(OutboxEvent, outboxEvent);
        }

        this.logger.log(`Order ${orderId} status updated to ${status}`);
      }
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Saga update error for order ${orderId}: ${err.message}`);
    } finally {
      await queryRunner.release();
    }
  }
}

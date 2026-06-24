import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { ConfirmPaymentCommand } from '../commands/confirm-payment.command';
import { OrderId } from '../../domain/value-objects';
import { IOrderRepository, ORDER_REPOSITORY } from '../../domain/ports';
import { IEventPublisher, EVENT_PUBLISHER } from '../../application/ports';
import { OrderMetricsService } from '../../infrastructure/observability/order-metrics.service';

@Injectable()
export class ConfirmPaymentHandler {
  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: IOrderRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
    private readonly metrics: OrderMetricsService,
  ) {}

  async execute(command: ConfirmPaymentCommand): Promise<void> {
    const order = await this.orderRepository.findById(
      OrderId.create(command.orderId),
    );

    if (!order) {
      throw new NotFoundException(`Order ${command.orderId} not found`);
    }

    const fromStatus = order.status.value;
    order.confirmPayment(command.paymentId);
    await this.orderRepository.save(order);

    const events = order.pullDomainEvents();
    await this.eventPublisher.publishAll(events);

    this.metrics.recordStatusChange(fromStatus, 'PAID');

    this.logger.log(`Payment confirmed for order ${command.orderId}`);
  }
}

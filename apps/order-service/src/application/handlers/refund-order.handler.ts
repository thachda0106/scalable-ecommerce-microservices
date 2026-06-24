import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { RefundOrderCommand } from '../commands/refund-order.command';
import { OrderId } from '../../domain/value-objects';
import { IOrderRepository, ORDER_REPOSITORY } from '../../domain/ports';
import { IEventPublisher, EVENT_PUBLISHER } from '../../application/ports';
import { OrderMetricsService } from '../../infrastructure/observability/order-metrics.service';

@Injectable()
export class RefundOrderHandler {
  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: IOrderRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
    private readonly metrics: OrderMetricsService,
  ) {}

  async execute(command: RefundOrderCommand): Promise<void> {
    const order = await this.orderRepository.findById(
      OrderId.create(command.orderId),
    );

    if (!order) {
      throw new NotFoundException(`Order ${command.orderId} not found`);
    }

    const fromStatus = order.status.value;
    order.refund(command.reason);
    await this.orderRepository.save(order);

    const events = order.pullDomainEvents();
    await this.eventPublisher.publishAll(events);

    this.metrics.recordStatusChange(fromStatus, 'REFUNDED');

    this.logger.log(`Order ${command.orderId} refunded: ${command.reason}`);
  }
}

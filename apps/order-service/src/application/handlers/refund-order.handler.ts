import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { RefundOrderCommand } from '../commands/refund-order.command';
import { OrderId } from '../../domain/value-objects';
import { IOrderRepository, ORDER_REPOSITORY } from '../../domain/ports';
import { IEventPublisher, EVENT_PUBLISHER } from '../../application/ports';

@Injectable()
export class RefundOrderHandler {
  private readonly logger = new Logger(RefundOrderHandler.name);

  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: IOrderRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: RefundOrderCommand): Promise<void> {
    const order = await this.orderRepository.findById(
      OrderId.create(command.orderId),
    );

    if (!order) {
      throw new NotFoundException(`Order ${command.orderId} not found`);
    }

    order.refund(command.reason);
    await this.orderRepository.save(order);

    const events = order.pullDomainEvents();
    await this.eventPublisher.publishAll(events);

    this.logger.log(`Order ${command.orderId} refunded: ${command.reason}`);
  }
}

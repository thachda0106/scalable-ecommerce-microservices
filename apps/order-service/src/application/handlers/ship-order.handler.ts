import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { ShipOrderCommand } from '../commands/ship-order.command';
import { OrderId } from '../../domain/value-objects';
import { IOrderRepository, ORDER_REPOSITORY } from '../../domain/ports';
import { IEventPublisher, EVENT_PUBLISHER } from '../../application/ports';

@Injectable()
export class ShipOrderHandler {
  private readonly logger = new Logger(ShipOrderHandler.name);

  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: IOrderRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: ShipOrderCommand): Promise<void> {
    const order = await this.orderRepository.findById(
      OrderId.create(command.orderId),
    );

    if (!order) {
      throw new NotFoundException(`Order ${command.orderId} not found`);
    }

    order.ship(command.trackingNumber);
    await this.orderRepository.save(order);

    const events = order.pullDomainEvents();
    await this.eventPublisher.publishAll(events);

    this.logger.log(`Order ${command.orderId} shipped with tracking ${command.trackingNumber}`);
  }
}

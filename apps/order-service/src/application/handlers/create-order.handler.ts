import { Injectable, Inject, Logger } from '@nestjs/common';
import { CreateOrderCommand } from '../commands/create-order.command';
import { Order } from '../../domain/entities/order.entity';
import { IOrderRepository, ORDER_REPOSITORY } from '../../domain/ports';
import { IEventPublisher, EVENT_PUBLISHER } from '../../application/ports';

@Injectable()
export class CreateOrderHandler {
  private readonly logger = new Logger(CreateOrderHandler.name);

  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: IOrderRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: CreateOrderCommand): Promise<string> {
    const order = Order.create({
      userId: command.userId,
      items: command.items,
    });

    await this.orderRepository.save(order);

    const events = order.pullDomainEvents();
    await this.eventPublisher.publishAll(events);

    this.logger.log(`Order ${order.id.value} created for user ${command.userId}`);
    return order.id.value;
  }
}

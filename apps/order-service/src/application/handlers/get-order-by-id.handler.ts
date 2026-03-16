import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { GetOrderByIdQuery } from '../queries/get-order-by-id.query';
import { Order } from '../../domain/entities/order.entity';
import { OrderId } from '../../domain/value-objects';
import { IOrderRepository, ORDER_REPOSITORY } from '../../domain/ports';

@Injectable()
export class GetOrderByIdHandler {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: IOrderRepository,
  ) {}

  async execute(query: GetOrderByIdQuery): Promise<Order> {
    const order = await this.orderRepository.findById(
      OrderId.create(query.orderId),
    );

    if (!order) {
      throw new NotFoundException(`Order ${query.orderId} not found`);
    }

    return order;
  }
}

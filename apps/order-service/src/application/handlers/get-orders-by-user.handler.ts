import { Injectable, Inject } from '@nestjs/common';
import { GetOrdersByUserQuery } from '../queries/get-orders-by-user.query';
import { Order } from '../../domain/entities/order.entity';
import { UserId } from '../../domain/value-objects';
import { IOrderRepository, ORDER_REPOSITORY } from '../../domain/ports';

@Injectable()
export class GetOrdersByUserHandler {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: IOrderRepository,
  ) {}

  async execute(query: GetOrdersByUserQuery): Promise<Order[]> {
    return this.orderRepository.findByUserId(UserId.create(query.userId));
  }
}

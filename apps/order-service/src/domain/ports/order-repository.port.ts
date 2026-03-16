import { Order } from '../entities/order.entity';
import { OrderId } from '../value-objects/order-id.vo';
import { UserId } from '../value-objects/user-id.vo';
import { OrderStatusEnum } from '../value-objects/order-status.vo';

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

export interface IOrderRepository {
  save(order: Order): Promise<void>;
  findById(id: OrderId): Promise<Order | null>;
  findByUserId(userId: UserId): Promise<Order[]>;
  findByStatus(status: OrderStatusEnum): Promise<Order[]>;
}

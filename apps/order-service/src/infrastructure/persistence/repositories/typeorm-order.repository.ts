import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IOrderRepository } from '../../../domain/ports/order-repository.port';
import { Order } from '../../../domain/entities/order.entity';
import { OrderId } from '../../../domain/value-objects/order-id.vo';
import { UserId } from '../../../domain/value-objects/user-id.vo';
import { OrderStatusEnum } from '../../../domain/value-objects/order-status.vo';
import { OrderOrmEntity } from '../entities/order.orm-entity';
import { OrderMapper } from '../mappers/order.mapper';

@Injectable()
export class TypeOrmOrderRepository implements IOrderRepository {
  constructor(
    @InjectRepository(OrderOrmEntity)
    private readonly ormRepo: Repository<OrderOrmEntity>,
  ) {}

  async save(order: Order): Promise<void> {
    const orm = OrderMapper.toPersistence(order);
    await this.ormRepo.save(orm);
  }

  async findById(id: OrderId): Promise<Order | null> {
    const orm = await this.ormRepo.findOne({
      where: { id: id.value },
      relations: ['items'],
    });
    return orm ? OrderMapper.toDomain(orm) : null;
  }

  async findByUserId(userId: UserId): Promise<Order[]> {
    const orms = await this.ormRepo.find({
      where: { userId: userId.value },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
    return orms.map(OrderMapper.toDomain);
  }

  async findByStatus(status: OrderStatusEnum): Promise<Order[]> {
    const orms = await this.ormRepo.find({
      where: { status },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
    return orms.map(OrderMapper.toDomain);
  }
}

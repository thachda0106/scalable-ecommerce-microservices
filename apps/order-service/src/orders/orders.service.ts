import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { OutboxEvent } from '../outbox/entities/outbox-event.entity';
import { v4 as uuidv4 } from 'uuid';

export class CreateOrderDto {
  userId: string;
  totalAmount: number;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    private dataSource: DataSource,
  ) {}

  async create(createOrderDto: CreateOrderDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Create the Order in PENDING status
      const order = this.ordersRepository.create({
        ...createOrderDto,
        status: OrderStatus.PENDING,
      });
      const savedOrder = await queryRunner.manager.save(Order, order);

      // 2. Wrap the OrderCreated event in the Outbox
      const outboxEvent = new OutboxEvent();
      outboxEvent.id = uuidv4();
      outboxEvent.type = 'OrderCreated';
      outboxEvent.payload = savedOrder;

      await queryRunner.manager.save(OutboxEvent, outboxEvent);

      // 3. Commit the transaction
      await queryRunner.commitTransaction();
      return savedOrder;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  findAll() {
    return this.ordersRepository.find();
  }

  findOne(id: string) {
    return this.ordersRepository.findOneBy({ id });
  }
}

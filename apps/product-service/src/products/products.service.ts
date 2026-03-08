import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Product, ProductStatus } from './entities/product.entity';
import { OutboxEvent } from '../outbox/entities/outbox-event.entity';
import { v4 as uuidv4 } from 'uuid';

export class CreateProductDto {
  name: string;
  description: string;
  price: number;
}

export class UpdateProductDto {
  name?: string;
  description?: string;
  price?: number;
  status?: ProductStatus;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    private dataSource: DataSource,
  ) {}

  async create(createProductDto: CreateProductDto): Promise<Product> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const product = this.productsRepository.create(createProductDto);
      const savedProduct = await queryRunner.manager.save(Product, product);

      const outboxEvent = new OutboxEvent();
      outboxEvent.id = uuidv4();
      outboxEvent.type = 'ProductCreated';
      outboxEvent.payload = savedProduct;

      await queryRunner.manager.save(OutboxEvent, outboxEvent);

      await queryRunner.commitTransaction();
      return savedProduct;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  findAll(): Promise<Product[]> {
    return this.productsRepository.find();
  }

  findOne(id: string): Promise<Product | null> {
    return this.productsRepository.findOneBy({ id });
  }

  async update(id: string, updateProductDto: UpdateProductDto): Promise<Product> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const product = await queryRunner.manager.findOneBy(Product, { id });
      if (!product) {
        throw new Error('Product not found');
      }

      const updatedProduct = queryRunner.manager.merge(Product, product, updateProductDto);
      const savedProduct = await queryRunner.manager.save(Product, updatedProduct);

      const outboxEvent = new OutboxEvent();
      outboxEvent.id = uuidv4();
      outboxEvent.type = 'ProductUpdated';
      outboxEvent.payload = savedProduct;

      await queryRunner.manager.save(OutboxEvent, outboxEvent);

      await queryRunner.commitTransaction();
      return savedProduct;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: string): Promise<void> {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const product = await queryRunner.manager.findOneBy(Product, { id });
        if (!product) {
          throw new Error('Product not found');
        }

        await queryRunner.manager.remove(Product, product);

        const outboxEvent = new OutboxEvent();
        outboxEvent.id = uuidv4();
        outboxEvent.type = 'ProductDeleted';
        outboxEvent.payload = { id };

        await queryRunner.manager.save(OutboxEvent, outboxEvent);

        await queryRunner.commitTransaction();
      } catch (err) {
        await queryRunner.rollbackTransaction();
        throw err;
      } finally {
        await queryRunner.release();
      }
  }
}

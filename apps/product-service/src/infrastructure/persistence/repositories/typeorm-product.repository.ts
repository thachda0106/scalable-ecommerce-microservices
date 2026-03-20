import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IProductRepository,
  ProductQuery,
  PaginatedResult,
} from '../../../domain/ports/product-repository.port';
import { Product } from '../../../domain/entities/product.entity';
import { ProductId } from '../../../domain/value-objects/product-id.vo';
import { ProductOrmEntity } from '../entities/product.orm-entity';
import { ProductMapper } from '../mappers/product.mapper';
import { safeExecute, StrategyType } from '@ecommerce/core';

const ALLOWED_SORT_FIELDS = ['name', 'price', 'createdAt'];

@Injectable()
export class TypeOrmProductRepository implements IProductRepository {
  constructor(
    @InjectRepository(ProductOrmEntity)
    private readonly repo: Repository<ProductOrmEntity>,
  ) {}

  async save(product: Product): Promise<void> {
    await safeExecute(
      async () => {
        const orm = ProductMapper.toPersistence(product);
        await this.repo.save(orm);
      },
      {
        strategy: StrategyType.FAIL_CLOSE,
        retry: { attempts: 3, backoffMs: 200 },
        circuitBreakerKey: 'product-db',
        label: 'DB:SaveProduct',
      },
    );
  }

  async findById(id: ProductId): Promise<Product | null> {
    const orm = await this.repo.findOneBy({ id: id.value });
    return orm ? ProductMapper.toDomain(orm) : null;
  }

  async findAll(query: ProductQuery): Promise<PaginatedResult<Product>> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const qb = this.repo.createQueryBuilder('product');

    // Dynamic filtering
    if (query.status) {
      qb.andWhere('product.status = :status', { status: query.status });
    }
    if (query.categoryId) {
      qb.andWhere('product.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    if (query.minPrice !== undefined) {
      qb.andWhere('product.price >= :minPrice', { minPrice: query.minPrice });
    }
    if (query.maxPrice !== undefined) {
      qb.andWhere('product.price <= :maxPrice', { maxPrice: query.maxPrice });
    }
    if (query.search) {
      qb.andWhere('product.name ILIKE :search', {
        search: `%${query.search}%`,
      });
    }

    // Sorting (validated against whitelist)
    const sortBy = ALLOWED_SORT_FIELDS.includes(query.sortBy ?? '')
      ? query.sortBy!
      : 'createdAt';
    const sortOrder = query.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`product.${sortBy}`, sortOrder);

    // Pagination
    qb.skip((page - 1) * limit).take(limit);

    const [ormEntities, total] = await qb.getManyAndCount();

    return {
      data: ormEntities.map(ProductMapper.toDomain),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByCategoryId(categoryId: string): Promise<Product[]> {
    const orms = await this.repo.find({ where: { categoryId } });
    return orms.map(ProductMapper.toDomain);
  }

  async delete(id: ProductId): Promise<void> {
    await safeExecute(
      async () => {
        await this.repo.delete({ id: id.value });
      },
      {
        strategy: StrategyType.FAIL_CLOSE,
        retry: { attempts: 3, backoffMs: 200 },
        circuitBreakerKey: 'product-db',
        label: 'DB:DeleteProduct',
      },
    );
  }
}

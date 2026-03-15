import { Inject, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetInventoryQuery } from '../queries/get-inventory.query';
import {
  INVENTORY_REPOSITORY,
  IInventoryRepository,
} from '../../domain/ports/inventory-repository.port';
import {
  STOCK_CACHE,
  IStockCache,
} from '../../domain/ports/stock-cache.port';

@QueryHandler(GetInventoryQuery)
export class GetInventoryHandler
  implements IQueryHandler<GetInventoryQuery>
{
  constructor(
    @Inject(INVENTORY_REPOSITORY) private readonly repo: IInventoryRepository,
    @Inject(STOCK_CACHE) private readonly cache: IStockCache,
  ) {}

  async execute(query: GetInventoryQuery) {
    // 1. Cache-first read
    const cached = await this.cache.get(query.productId);
    if (cached) {
      return cached.toJSON();
    }

    // 2. Cache miss — load from DB
    const inventory = await this.repo.findByProductId(query.productId);
    if (!inventory) {
      throw new NotFoundException(
        `Inventory not found for product ${query.productId}`,
      );
    }

    // 3. Warm cache
    await this.cache.set(query.productId, inventory);

    return inventory.toJSON();
  }
}

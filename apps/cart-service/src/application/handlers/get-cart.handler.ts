import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetCartQuery } from '../queries/get-cart.query';
import {
  CART_REPOSITORY,
  ICartRepository,
} from '../ports/cart-repository.port';
import { CART_CACHE, ICartCache } from '../ports/cart-cache.port';
import { Cart } from '../../domain/entities/cart.entity';

@QueryHandler(GetCartQuery)
export class GetCartHandler implements IQueryHandler<GetCartQuery> {
  constructor(
    @Inject(CART_CACHE) private readonly cartCache: ICartCache,
    @Inject(CART_REPOSITORY) private readonly cartRepository: ICartRepository,
  ) {}

  async execute(query: GetCartQuery): Promise<ReturnType<Cart['toJSON']>> {
    // 1. Cache-first lookup  (happy path: ~1ms Redis read)
    const cached = await this.cartCache.get(query.userId);
    if (cached) {
      return cached.toJSON();
    }

    // 2. Cache miss: fall back to repository
    const cart = await this.cartRepository.findByUserId(query.userId);

    if (!cart) {
      // Return an empty cart representation without persisting
      return { id: '', userId: query.userId, items: [] };
    }

    // 3. Warm the cache for subsequent reads
    await this.cartCache.set(query.userId, cart);

    return cart.toJSON();
  }
}

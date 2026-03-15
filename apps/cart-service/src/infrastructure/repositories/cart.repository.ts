import { Injectable } from '@nestjs/common';
import { ICartRepository } from '../../domain/repositories/cart-repository.interface';
import { Cart } from '../../domain/entities/cart.entity';
import { CartItem } from '../../domain/entities/cart-item.entity';
import { ProductId } from '../../domain/value-objects/product-id.vo';
import { Quantity } from '../../domain/value-objects/quantity.vo';
import { CartDocument } from '../persistence/cart.schema';

/**
 * In-memory cart repository backed by a Map.
 * No external DB dependencies — allows the service to run independently for dev/testing.
 *
 * TODO: Replace with a MongoDB/Mongoose implementation for production.
 */
@Injectable()
export class InMemoryCartRepository implements ICartRepository {
  private readonly store = new Map<string, CartDocument>();

  async findByUserId(userId: string): Promise<Cart | null> {
    const doc = this.store.get(userId);
    if (!doc) return null;

    const items = doc.items.map((i) =>
      CartItem.create(
        ProductId.create(i.productId),
        Quantity.create(i.quantity),
        i.snapshottedPrice,
      ),
    );

    return Cart.reconstitute(doc.id, doc.userId, items);
  }

  async save(cart: Cart): Promise<void> {
    const json = cart.toJSON();
    this.store.set(cart.userId, {
      id: json.id,
      userId: json.userId,
      items: json.items,
      updatedAt: new Date(),
    });
  }
}

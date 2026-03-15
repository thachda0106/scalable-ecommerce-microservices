import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { RemoveItemCommand } from '../commands/remove-item.command';
import {
  CART_REPOSITORY,
  ICartRepository,
} from '../ports/cart-repository.port';
import { CART_CACHE, ICartCache } from '../ports/cart-cache.port';
import { CART_OUTBOX, ICartOutbox } from '../ports/cart-outbox.port';
import { Cart } from '../../domain/entities/cart.entity';
import { ProductId } from '../../domain/value-objects/product-id.vo';
import { CartNotFoundException } from '../../domain/exceptions';

@CommandHandler(RemoveItemCommand)
export class RemoveItemHandler implements ICommandHandler<RemoveItemCommand> {
  constructor(
    @Inject(CART_REPOSITORY) private readonly cartRepository: ICartRepository,
    @Inject(CART_CACHE) private readonly cartCache: ICartCache,
    @Inject(CART_OUTBOX) private readonly outbox: ICartOutbox,
  ) {}

  async execute(
    command: RemoveItemCommand,
  ): Promise<ReturnType<Cart['toJSON']>> {
    const cart = await this.cartRepository.findByUserId(command.userId);
    if (!cart) {
      throw new CartNotFoundException(command.userId);
    }

    const productId = ProductId.create(command.productId);

    // Domain throws ItemNotInCartException if item is not in cart
    cart.removeItem(productId);

    await this.cartRepository.save(cart);
    await this.cartCache.set(command.userId, cart);

    const events = cart.pullEvents();
    await this.outbox.append(events);

    return cart.toJSON();
  }
}

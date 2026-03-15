import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { AddItemCommand } from '../commands/add-item.command';
import { CART_REPOSITORY, ICartRepository } from '../ports/cart-repository.port';
import { CART_CACHE, ICartCache } from '../ports/cart-cache.port';
import { CART_EVENTS_PRODUCER, ICartEventsProducer } from '../ports/cart-events.port';
import { Cart } from '../../domain/entities/cart.entity';
import { ProductId } from '../../domain/value-objects/product-id.vo';
import { Quantity } from '../../domain/value-objects/quantity.vo';

@CommandHandler(AddItemCommand)
export class AddItemHandler implements ICommandHandler<AddItemCommand> {
  constructor(
    @Inject(CART_REPOSITORY) private readonly cartRepository: ICartRepository,
    @Inject(CART_CACHE) private readonly cartCache: ICartCache,
    @Inject(CART_EVENTS_PRODUCER) private readonly eventsProducer: ICartEventsProducer,
  ) {}

  async execute(command: AddItemCommand): Promise<ReturnType<Cart['toJSON']>> {
    // 1. Load or create cart
    let cart = await this.cartRepository.findByUserId(command.userId);
    if (!cart) {
      cart = Cart.create(command.userId);
    }

    // 2. Create value objects — domain validates rules
    const productId = ProductId.create(command.productId);
    const quantity = Quantity.create(command.quantity);

    // 3. Domain mutation — enforces: max qty, duplicate merge
    cart.addItem(productId, quantity, command.snapshottedPrice);

    // 4. Persist
    await this.cartRepository.save(cart);

    // 5. Invalidate cache on every write
    await this.cartCache.invalidate(command.userId);

    // 6. Publish domain events
    const events = cart.pullEvents();
    await Promise.all(events.map((e) => this.eventsProducer.publish(e)));

    return cart.toJSON();
  }
}

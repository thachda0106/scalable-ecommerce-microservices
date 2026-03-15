import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateItemQuantityCommand } from '../commands/update-item-quantity.command';
import {
  CART_REPOSITORY,
  ICartRepository,
} from '../ports/cart-repository.port';
import { CART_CACHE, ICartCache } from '../ports/cart-cache.port';
import {
  CART_EVENTS_PRODUCER,
  ICartEventsProducer,
} from '../ports/cart-events.port';
import { Cart } from '../../domain/entities/cart.entity';
import { ProductId } from '../../domain/value-objects/product-id.vo';
import { Quantity } from '../../domain/value-objects/quantity.vo';
import { CartNotFoundException } from '../../domain/exceptions';

@CommandHandler(UpdateItemQuantityCommand)
export class UpdateItemQuantityHandler implements ICommandHandler<UpdateItemQuantityCommand> {
  constructor(
    @Inject(CART_REPOSITORY) private readonly cartRepository: ICartRepository,
    @Inject(CART_CACHE) private readonly cartCache: ICartCache,
    @Inject(CART_EVENTS_PRODUCER)
    private readonly eventsProducer: ICartEventsProducer,
  ) {}

  async execute(
    command: UpdateItemQuantityCommand,
  ): Promise<ReturnType<Cart['toJSON']>> {
    const cart = await this.cartRepository.findByUserId(command.userId);
    if (!cart) {
      throw new CartNotFoundException(command.userId);
    }

    const productId = ProductId.create(command.productId);
    const newQuantity = Quantity.create(command.quantity);

    // Domain throws ItemNotInCartException if item doesn't exist
    cart.updateItemQuantity(productId, newQuantity);

    await this.cartRepository.save(cart);
    await this.cartCache.invalidate(command.userId);

    const events = cart.pullEvents();
    await Promise.all(events.map((e) => this.eventsProducer.publish(e)));

    return cart.toJSON();
  }
}

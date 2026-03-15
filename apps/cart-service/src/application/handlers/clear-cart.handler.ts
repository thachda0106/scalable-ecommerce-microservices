import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { ClearCartCommand } from '../commands/clear-cart.command';
import {
  CART_REPOSITORY,
  ICartRepository,
} from '../ports/cart-repository.port';
import { CART_CACHE, ICartCache } from '../ports/cart-cache.port';
import {
  CART_EVENTS_PRODUCER,
  ICartEventsProducer,
} from '../ports/cart-events.port';

@CommandHandler(ClearCartCommand)
export class ClearCartHandler implements ICommandHandler<ClearCartCommand> {
  constructor(
    @Inject(CART_REPOSITORY) private readonly cartRepository: ICartRepository,
    @Inject(CART_CACHE) private readonly cartCache: ICartCache,
    @Inject(CART_EVENTS_PRODUCER) private readonly eventsProducer: ICartEventsProducer,
  ) {}

  async execute(command: ClearCartCommand): Promise<{ message: string }> {
    const cart = await this.cartRepository.findByUserId(command.userId);
    if (!cart) {
      throw new NotFoundException(`Cart not found for user ${command.userId}`);
    }

    cart.clear();

    await this.cartRepository.save(cart);
    await this.cartCache.invalidate(command.userId);

    const events = cart.pullEvents();
    await Promise.all(events.map((e) => this.eventsProducer.publish(e)));

    return { message: 'Cart cleared successfully' };
  }
}

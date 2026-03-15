import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { AddItemCommand } from '../commands/add-item.command';
import {
  CART_REPOSITORY,
  ICartRepository,
} from '../ports/cart-repository.port';
import { CART_CACHE, ICartCache } from '../ports/cart-cache.port';
import { CART_OUTBOX, ICartOutbox } from '../ports/cart-outbox.port';
import { Cart } from '../../domain/entities/cart.entity';
import { ProductId } from '../../domain/value-objects/product-id.vo';
import { Quantity } from '../../domain/value-objects/quantity.vo';
import {
  ProductNotFoundException,
  InsufficientStockException,
} from '../../domain/exceptions';
import { ProductServiceClient } from '../../infrastructure/http/product-service.client';
import { InventoryServiceClient } from '../../infrastructure/http/inventory-service.client';

@CommandHandler(AddItemCommand)
export class AddItemHandler implements ICommandHandler<AddItemCommand> {
  constructor(
    @Inject(CART_REPOSITORY) private readonly cartRepository: ICartRepository,
    @Inject(CART_CACHE) private readonly cartCache: ICartCache,
    @Inject(CART_OUTBOX) private readonly outbox: ICartOutbox,
    private readonly productClient: ProductServiceClient,
    private readonly inventoryClient: InventoryServiceClient,
  ) {}

  async execute(command: AddItemCommand): Promise<ReturnType<Cart['toJSON']>> {
    // 1. Validate product exists upstream
    const productExists = await this.productClient.validateProduct(
      command.productId,
    );
    if (!productExists) {
      throw new ProductNotFoundException(command.productId);
    }

    // 2. Validate stock availability
    const inStock = await this.inventoryClient.checkStock(
      command.productId,
      command.quantity,
    );
    if (!inStock) {
      throw new InsufficientStockException(command.productId);
    }

    // 3. Load or create cart
    let cart = await this.cartRepository.findByUserId(command.userId);
    if (!cart) {
      cart = Cart.create(command.userId);
    }

    // 4. Create value objects — domain validates rules
    const productId = ProductId.create(command.productId);
    const quantity = Quantity.create(command.quantity);

    // 5. Domain mutation — enforces: max qty, duplicate merge
    cart.addItem(productId, quantity, command.snapshottedPrice);

    // 6. Persist (with optimistic locking)
    await this.cartRepository.save(cart);

    // 7. Write-through cache
    await this.cartCache.set(command.userId, cart);

    // 8. Append events to outbox (relayed to Kafka by background worker)
    const events = cart.pullEvents();
    await this.outbox.append(events);

    return cart.toJSON();
  }
}

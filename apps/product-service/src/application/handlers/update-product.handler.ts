import { Injectable, Inject } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { UpdateProductCommand } from '../commands/update-product.command';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../domain/ports';
import { IEventPublisher, EVENT_PUBLISHER } from '../ports';
import { IProductCache, PRODUCT_CACHE } from '../ports';
import { ProductNotFoundError } from '../../domain/errors';
import { ProductId } from '../../domain/value-objects';
import { ProductMetricsService } from '../../infrastructure/observability/product-metrics.service';

@Injectable()
export class UpdateProductHandler {
  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepository: IProductRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
    @Inject(PRODUCT_CACHE)
    private readonly productCache: IProductCache,
    private readonly metrics: ProductMetricsService,
  ) {}

  async execute(command: UpdateProductCommand): Promise<void> {
    const stopTimer = this.metrics.startTimer('update_product');

    const product = await this.productRepository.findById(
      ProductId.create(command.productId),
    );
    if (!product) {
      throw new ProductNotFoundError(command.productId);
    }

    product.updateDetails({
      name: command.name,
      description: command.description,
      price: command.price,
      currency: command.currency,
      categoryId: command.categoryId,
    });

    await this.productRepository.save(product);

    const events = product.pullDomainEvents();
    await this.eventPublisher.publishAll(events);

    await this.productCache.invalidateById(command.productId);

    this.metrics.incrementProductsUpdated();
    stopTimer();

    this.logger.log(`Product ${command.productId} updated`);
  }
}

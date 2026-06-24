import { Injectable, Inject } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { DeleteProductCommand } from '../commands/delete-product.command';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../domain/ports';
import { IEventPublisher, EVENT_PUBLISHER } from '../ports';
import { IProductCache, PRODUCT_CACHE } from '../ports';
import { ProductNotFoundError } from '../../domain/errors';
import { ProductId } from '../../domain/value-objects';
import { ProductMetricsService } from '../../infrastructure/observability/product-metrics.service';

@Injectable()
export class DeleteProductHandler {
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

  async execute(command: DeleteProductCommand): Promise<void> {
    const stopTimer = this.metrics.startTimer('delete_product');

    const productId = ProductId.create(command.productId);
    const product = await this.productRepository.findById(productId);
    if (!product) {
      throw new ProductNotFoundError(command.productId);
    }

    // Soft delete: archive the product instead of hard-deleting
    product.archive();

    await this.productRepository.save(product);

    const events = product.pullDomainEvents();
    await this.eventPublisher.publishAll(events);

    await this.productCache.invalidateById(command.productId);

    this.metrics.incrementProductsDeleted();
    stopTimer();

    this.logger.log(`Product ${command.productId} archived (soft-deleted)`);
  }
}

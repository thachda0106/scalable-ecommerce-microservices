import { Injectable, Inject } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { UpdateProductStatusCommand } from '../commands/update-product-status.command';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../domain/ports';
import { IEventPublisher, EVENT_PUBLISHER } from '../ports';
import { IProductCache, PRODUCT_CACHE } from '../ports';
import { ProductNotFoundError } from '../../domain/errors';
import { ProductId } from '../../domain/value-objects';
import { ProductMetricsService } from '../../infrastructure/observability/product-metrics.service';

@Injectable()
export class UpdateProductStatusHandler {
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

  async execute(command: UpdateProductStatusCommand): Promise<void> {
    const stopTimer = this.metrics.startTimer('update_product_status');

    const product = await this.productRepository.findById(
      ProductId.create(command.productId),
    );
    if (!product) {
      throw new ProductNotFoundError(command.productId);
    }

    const fromStatus = product.status.value;

    switch (command.action) {
      case 'activate':
        product.activate();
        break;
      case 'deactivate':
        product.deactivate();
        break;
      case 'markOutOfStock':
        product.markOutOfStock();
        break;
      case 'archive':
        product.archive();
        break;
      case 'restock':
        product.restock();
        break;
    }

    await this.productRepository.save(product);

    const events = product.pullDomainEvents();
    await this.eventPublisher.publishAll(events);

    await this.productCache.invalidateById(command.productId);

    this.metrics.recordStatusChange(fromStatus, product.status.value);
    stopTimer();

    this.logger.log(
      `Product ${command.productId} status changed: ${fromStatus} → ${product.status.value}`,
    );
  }
}

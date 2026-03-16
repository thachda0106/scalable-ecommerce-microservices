import { Injectable, Inject, Logger } from '@nestjs/common';
import { DeleteProductCommand } from '../commands/delete-product.command';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../domain/ports';
import { IEventPublisher, EVENT_PUBLISHER } from '../ports';
import { IProductCache, PRODUCT_CACHE } from '../ports';
import { ProductNotFoundError } from '../../domain/errors';
import { ProductId } from '../../domain/value-objects';
import { ProductDeletedEvent } from '../../domain/events';
import { ProductMetricsService } from '../../infrastructure/observability/product-metrics.service';

@Injectable()
export class DeleteProductHandler {
  private readonly logger = new Logger(DeleteProductHandler.name);

  constructor(
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

    await this.productRepository.delete(productId);

    const event = new ProductDeletedEvent(command.productId);
    await this.eventPublisher.publish(event);

    await this.productCache.invalidateById(command.productId);

    this.metrics.incrementProductsDeleted();
    stopTimer();

    this.logger.log(`Product ${command.productId} deleted`);
  }
}

import { Injectable, Inject } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { CreateProductCommand } from '../commands/create-product.command';
import { Product } from '../../domain/entities/product.entity';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../domain/ports';
import { IEventPublisher, EVENT_PUBLISHER } from '../ports';
import { IProductCache, PRODUCT_CACHE } from '../ports';
import { ProductMetricsService } from '../../infrastructure/observability/product-metrics.service';

@Injectable()
export class CreateProductHandler {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepository: IProductRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
    @Inject(PRODUCT_CACHE)
    private readonly productCache: IProductCache,
    private readonly metrics: ProductMetricsService,
    @Inject(Logger)
    private readonly logger: Logger,
  ) {}

  async execute(command: CreateProductCommand): Promise<string> {
    const stopTimer = this.metrics.startTimer('create_product');

    const product = Product.create({
      name: command.name,
      description: command.description,
      price: command.price,
      currency: command.currency,
      categoryId: command.categoryId,
    });

    await this.productRepository.save(product);

    const events = product.pullDomainEvents();
    await this.eventPublisher.publishAll(events);

    await this.productCache.setById(product.id.value, product);

    this.metrics.incrementProductsCreated();
    stopTimer();

    this.logger.log(`Product ${product.id.value} created: ${command.name}`);
    return product.id.value;
  }
}

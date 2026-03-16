import { Injectable, Inject, Logger } from '@nestjs/common';
import { GetProductByIdQuery } from '../queries/get-product-by-id.query';
import { Product } from '../../domain/entities/product.entity';
import { IProductRepository, PRODUCT_REPOSITORY } from '../../domain/ports';
import { IProductCache, PRODUCT_CACHE } from '../ports';
import { ProductNotFoundError } from '../../domain/errors';
import { ProductId } from '../../domain/value-objects';
import { ProductMetricsService } from '../../infrastructure/observability/product-metrics.service';

@Injectable()
export class GetProductByIdHandler {
  private readonly logger = new Logger(GetProductByIdHandler.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepository: IProductRepository,
    @Inject(PRODUCT_CACHE)
    private readonly productCache: IProductCache,
    private readonly metrics: ProductMetricsService,
  ) {}

  async execute(query: GetProductByIdQuery): Promise<Product> {
    const stopTimer = this.metrics.startTimer('get_product_by_id');

    // Cache-aside: check cache first
    const cached = await this.productCache.getById(query.productId);
    if (cached) {
      this.metrics.incrementCacheHit();
      stopTimer();
      return cached;
    }

    this.metrics.incrementCacheMiss();

    // Cache miss: query repository
    const product = await this.productRepository.findById(
      ProductId.create(query.productId),
    );
    if (!product) {
      stopTimer();
      throw new ProductNotFoundError(query.productId);
    }

    // Populate cache
    await this.productCache.setById(query.productId, product);

    stopTimer();
    return product;
  }
}

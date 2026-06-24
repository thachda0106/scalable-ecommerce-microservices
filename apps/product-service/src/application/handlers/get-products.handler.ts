import { Injectable, Inject } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { GetProductsQuery } from '../queries/get-products.query';
import { Product } from '../../domain/entities/product.entity';
import {
  IProductRepository,
  PRODUCT_REPOSITORY,
  PaginatedResult,
  ProductQuery,
} from '../../domain/ports';
import { ProductStatusEnum } from '../../domain/value-objects';
import { ProductMetricsService } from '../../infrastructure/observability/product-metrics.service';

@Injectable()
export class GetProductsHandler {
  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepository: IProductRepository,
    private readonly metrics: ProductMetricsService,
  ) {}

  async execute(query: GetProductsQuery): Promise<PaginatedResult<Product>> {
    const stopTimer = this.metrics.startTimer('get_products');

    const productQuery: ProductQuery = {
      page: query.page ?? 1,
      limit: Math.min(query.limit ?? 20, 100),
      sortBy: query.sortBy ?? 'createdAt',
      sortOrder: query.sortOrder ?? 'DESC',
      status: query.status as ProductStatusEnum | undefined,
      categoryId: query.categoryId,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      search: query.search,
    };

    const result = await this.productRepository.findAll(productQuery);

    stopTimer();
    return result;
  }
}

import { Product } from '../entities/product.entity';
import { ProductId } from '../value-objects/product-id.vo';
import { ProductStatusEnum } from '../value-objects/product-status.vo';

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');

export interface ProductQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  status?: ProductStatusEnum;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface IProductRepository {
  save(product: Product): Promise<void>;
  findById(id: ProductId): Promise<Product | null>;
  findAll(query: ProductQuery): Promise<PaginatedResult<Product>>;
  findByCategoryId(categoryId: string): Promise<Product[]>;
  delete(id: ProductId): Promise<void>;
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { Injectable, HttpException } from '@nestjs/common';
import { BaseHttpClient } from '../../common/http-client';
import { ConfigService } from '@nestjs/config';
import type { GatewayRequest } from '../../common/types';

@Injectable()
export class ProductPageService {
  constructor(
    private readonly httpClient: BaseHttpClient,
    private readonly configService: ConfigService,
  ) {}

  async getPage(productId: string, req: GatewayRequest) {
    const productUrl = this.configService.get<string>(
      'gateway.services.product',
    );
    const inventoryUrl = this.configService.get<string>(
      'gateway.services.inventory',
    );

    if (!productUrl || !inventoryUrl) {
      throw new HttpException(
        'Aggregation dependencies not fully configured',
        503,
      );
    }

    try {
      const productP = this.httpClient.forwardRequest(
        `${productUrl}/products/${productId}`,
        {
          ...req,
          method: 'GET',
          url: `/products/${productId}`,
          body: undefined,
        } as any,
      );
      const inventoryP = this.httpClient.forwardRequest(
        `${inventoryUrl}/inventory/${productId}`,
        {
          ...req,
          method: 'GET',
          url: `/inventory/${productId}`,
          body: undefined,
        } as any,
      );
      const reviewsP = this.httpClient
        .forwardRequest(`${productUrl}/reviews/product/${productId}`, {
          ...req,
          method: 'GET',
          url: `/reviews/product/${productId}`,
          body: undefined,
        } as any)
        .catch(() => []); // optional fallback

      const [product, inventory, reviews] = await Promise.all([
        productP,
        inventoryP,
        reviewsP,
      ]);

      return {
        product,
        inventory,
        reviews,
      };
    } catch {
      throw new HttpException('Product Aggregation Failed', 500);
    }
  }
}

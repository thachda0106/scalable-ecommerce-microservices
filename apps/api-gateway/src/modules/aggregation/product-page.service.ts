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

    const headers: Record<string, string> = {};
    if (req.headers['x-request-id']) {
      headers['x-request-id'] = req.headers['x-request-id'] as string;
    }
    if (req.headers.authorization) {
      headers.authorization = req.headers.authorization;
    }

    try {
      const productP = this.httpClient.directGet(
        `${productUrl}/products/${productId}`,
        headers,
      );
      const inventoryP = this.httpClient.directGet(
        `${inventoryUrl}/inventory/${productId}`,
        headers,
      );
      const reviewsP = this.httpClient
        .directGet(`${productUrl}/reviews/product/${productId}`, headers)
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

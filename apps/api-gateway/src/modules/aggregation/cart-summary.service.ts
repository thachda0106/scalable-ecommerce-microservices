import { Injectable, HttpException } from '@nestjs/common';
import { BaseHttpClient } from '../../common/http-client';
import { ConfigService } from '@nestjs/config';
import type { GatewayRequest } from '../../common/types';

export interface CartData {
  items?: Array<{ productId: string }>;
  [key: string]: unknown;
}

@Injectable()
export class CartSummaryService {
  constructor(
    private readonly httpClient: BaseHttpClient,
    private readonly configService: ConfigService,
  ) {}

  async getSummary(req: GatewayRequest) {
    const cartUrl = this.configService.get<string>('gateway.services.cart');
    const productUrl = this.configService.get<string>(
      'gateway.services.product',
    );
    const inventoryUrl = this.configService.get<string>(
      'gateway.services.inventory',
    );

    if (!cartUrl || !productUrl || !inventoryUrl) {
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
    if (req.user?.userId) {
      headers['x-user-id'] = req.user.userId;
    }

    try {
      // 1. Fetch user's cart
      const cartData = (await this.httpClient.forwardRequest(
        `${cartUrl}/cart`,
        req,
      )) as CartData;

      if (!cartData?.items || cartData.items.length === 0) {
        return { cart: cartData, enrichments: [] };
      }

      // 2. Concurrently fetch product details and inventory
      const itemPromises = cartData.items.map(async (item) => {
        const productP = this.httpClient.directGet(
          `${productUrl}/products/${item.productId}`,
          headers,
        );
        const inventoryP = this.httpClient.directGet(
          `${inventoryUrl}/inventory/${item.productId}`,
          headers,
        );

        try {
          const [product, inventory] = await Promise.all([
            productP,
            inventoryP,
          ]);
          return { item, product, inventory };
        } catch {
          // Graceful degradation for partial failures
          return {
            item,
            product: null,
            inventory: null,
            error: 'Enrichment failed',
          };
        }
      });

      const enrichments = await Promise.all(itemPromises);

      return {
        cart: cartData,
        enrichments,
      };
    } catch {
      throw new HttpException('Cart Aggregation Failed', 500);
    }
  }
}

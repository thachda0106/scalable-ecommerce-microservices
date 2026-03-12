/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { Injectable, HttpException } from '@nestjs/common';
import { BaseHttpClient } from '../../common/http-client';
import { ConfigService } from '@nestjs/config';
import type { GatewayRequest } from '../../common/types';

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

    try {
      // 1. Fetch user's cart
      const cartTarget = `${cartUrl}/cart`;
      const cartData = await this.httpClient.forwardRequest(cartTarget, req);

      if (!cartData || !cartData.items || cartData.items.length === 0) {
        return { cart: cartData, enrichments: [] };
      }

      // 2. Concurrently fetch product details and inventory models
      const itemPromises = cartData.items.map(async (item: any) => {
        const productP = this.httpClient.forwardRequest(
          `${productUrl}/products/${item.productId}`,
          {
            ...req,
            method: 'GET',
            url: `/products/${item.productId}`,
            body: undefined,
          } as any,
        );
        const inventoryP = this.httpClient.forwardRequest(
          `${inventoryUrl}/inventory/${item.productId}`,
          {
            ...req,
            method: 'GET',
            url: `/inventory/${item.productId}`,
            body: undefined,
          } as any,
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

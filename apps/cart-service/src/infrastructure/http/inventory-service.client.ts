import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { safeExecute, StrategyType } from '@ecommerce/core';

@Injectable()
export class InventoryServiceClient {
  private readonly logger = new Logger(InventoryServiceClient.name);
  private readonly baseUrl =
    process.env.INVENTORY_SERVICE_URL ?? 'http://inventory-service:3006';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Checks whether sufficient stock is available for a product.
   * Graceful fallback: returns true if the service is unreachable,
   * allowing the cart to function independently during development.
   */
  async checkStock(productId: string, quantity: number): Promise<boolean> {
    try {
      const response = await safeExecute(
        async () => {
          const { data, status } = await firstValueFrom(
            this.httpService.get(
              `${this.baseUrl}/inventory/${productId}/available`,
              { params: { quantity } },
            ),
          );

          if (status !== 200) return false;
          return data?.available === true;
        },
        {
          strategy: StrategyType.FAIL_CLOSE,
          timeout: 3000,
          retry: { attempts: 2, backoffMs: 500 },
          circuitBreakerKey: 'inventory-service-http',
          label: `CheckStock:${productId}`,
        },
      );

      return response ?? false;
    } catch (err: any) {
      // System error (timeout, 5xx, circuit breaker open) => degrade gracefully
      this.logger.warn(
        `inventory-service unavailable for product ${productId}: ${err?.message}. Allowing add.`,
      );
      return true;
    }
  }
}

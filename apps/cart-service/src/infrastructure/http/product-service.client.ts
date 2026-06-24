import { Injectable, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { safeExecute, StrategyType, Logger } from '@ecommerce/core';

@Injectable()
export class ProductServiceClient {
  private readonly baseUrl =
    process.env.PRODUCT_SERVICE_URL ?? 'http://product-service:3003';

  constructor(
    @Inject(Logger) private readonly logger: Logger,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Validates that a product exists in the product-service.
   * Graceful fallback: returns true if the service is unreachable,
   * allowing the cart to function independently during development.
   */
  async validateProduct(productId: string): Promise<boolean> {
    try {
      const response = await safeExecute(
        async () => {
          const { status } = await firstValueFrom(
            this.httpService.get(`${this.baseUrl}/products/${productId}`),
          );
          return status === 200;
        },
        {
          strategy: StrategyType.FAIL_CLOSE, // Fail close so we can catch 404s
          timeout: 3000,
          retry: { attempts: 2, backoffMs: 500 },
          circuitBreakerKey: 'product-service-http',
          label: `ValidateProduct:${productId}`,
        },
      );

      return response ?? false;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        return false; // Business logic: product not found
      }
      // System error (timeout, 5xx, circuit breaker open) => degrade gracefully
      this.logger.warn(
        `product-service unavailable for product ${productId}: ${err?.message}. Allowing add.`,
      );
      return true;
    }
  }
}

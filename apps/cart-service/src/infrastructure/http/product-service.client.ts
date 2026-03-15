import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ProductServiceClient {
  private readonly logger = new Logger(ProductServiceClient.name);
  private readonly baseUrl =
    process.env.PRODUCT_SERVICE_URL ?? 'http://product-service:3003';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Validates that a product exists in the product-service.
   * Graceful fallback: returns true if the service is unreachable,
   * allowing the cart to function independently during development.
   */
  async validateProduct(productId: string): Promise<boolean> {
    try {
      const { status } = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/products/${productId}`),
      );
      return status === 200;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        return false;
      }
      // Service unreachable — degrade gracefully
      this.logger.warn(
        `product-service unavailable for product ${productId}: ${err?.message}. Allowing add.`,
      );
      return true;
    }
  }
}

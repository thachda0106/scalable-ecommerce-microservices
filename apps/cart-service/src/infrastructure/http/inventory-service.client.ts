import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

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
      const { data, status } = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/inventory/${productId}/available`,
          { params: { quantity } },
        ),
      );

      if (status !== 200) return false;

      return data?.available === true;
    } catch (err: any) {
      // Service unreachable — degrade gracefully
      this.logger.warn(
        `inventory-service unavailable for product ${productId}: ${err?.message}. Allowing add.`,
      );
      return true;
    }
  }
}

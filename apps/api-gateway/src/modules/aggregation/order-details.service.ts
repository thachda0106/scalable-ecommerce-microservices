import { Injectable, HttpException } from '@nestjs/common';
import { BaseHttpClient } from '../../common/http-client';
import { ConfigService } from '@nestjs/config';
import type { GatewayRequest } from '../../common/types';

@Injectable()
export class OrderDetailsService {
  constructor(
    private readonly httpClient: BaseHttpClient,
    private readonly configService: ConfigService,
  ) {}

  async getDetails(orderId: string, req: GatewayRequest) {
    const orderUrl = this.configService.get<string>('gateway.services.order');
    const paymentUrl = this.configService.get<string>(
      'gateway.services.payment',
    );

    if (!orderUrl || !paymentUrl) {
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
      // Fetch Order first to guarantee existence before parallelizing
      const targetOrder = `${orderUrl}/orders/${orderId}`;
      const orderData = await this.httpClient.forwardRequest(targetOrder, req);

      if (!orderData) {
        throw new HttpException('Order Payload Empty', 404);
      }

      // Fetch payment details linked to an order safely
      let paymentData: unknown = null;
      try {
        paymentData = await this.httpClient.directGet(
          `${paymentUrl}/payments/order/${orderId}`,
          headers,
        );
      } catch {
        paymentData = { status: 'payment tracking unavailable' };
      }

      return {
        order: orderData,
        payment: paymentData,
      };
    } catch {
      throw new HttpException('Order Aggregation Failed', 500);
    }
  }
}

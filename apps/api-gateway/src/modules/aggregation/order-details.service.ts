/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
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

    try {
      // Fetch Order first to guarantee existence before parallelizing
      const targetOrder = `${orderUrl}/orders/${orderId}`;
      const orderData = await this.httpClient.forwardRequest(targetOrder, req);

      if (!orderData) {
        throw new HttpException('Order Payload Empty', 404);
      }

      // Fetch payment details linked to an order safely
      let paymentData: any = null;
      try {
        paymentData = await this.httpClient.forwardRequest(
          `${paymentUrl}/payments/order/${orderId}`,
          {
            ...req,
            method: 'GET',
            url: `/payments/order/${orderId}`,
            body: undefined,
          } as any,
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

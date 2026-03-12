import { Injectable, HttpException } from "@nestjs/common";
import { BaseHttpClient } from "../../common/http-client";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

@Injectable()
export class OrderDetailsService {
  constructor(
    private readonly httpClient: BaseHttpClient,
    private readonly configService: ConfigService,
  ) {}

  async getDetails(orderId: string, req: any) {
    const orderUrl = this.configService.get<string>("services.order");
    const paymentUrl = this.configService.get<string>("services.payment");

    if (!orderUrl || !paymentUrl) {
      throw new HttpException(
        "Aggregation dependencies not fully configured",
        503,
      );
    }

    try {
      // Fetch Order first to guarantee existence before parallelizing
      const targetOrder = `${orderUrl}/orders/${orderId}`;
      const orderData = await this.httpClient.forwardRequest(targetOrder, req);

      if (!orderData) {
        throw new HttpException("Order Payload Empty", 404);
      }

      // Fetch payment details linked to an order safely
      let paymentData: any = null;
      try {
        paymentData = await this.httpClient.forwardRequest(
          `${paymentUrl}/payments/order/${orderId}`,
          {
            ...req,
            method: "GET",
            url: `/payments/order/${orderId}`,
            body: undefined,
          } as any,
        );
      } catch (err) {
        paymentData = { status: "payment tracking unavailable" };
      }

      return {
        order: orderData,
        payment: paymentData,
      };
    } catch (error) {
      throw new HttpException("Order Aggregation Failed", 500);
    }
  }
}

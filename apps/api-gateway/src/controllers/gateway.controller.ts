import {
  Controller,
  All,
  Req,
  Inject,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request } from "express";
import { ConfigType } from "@nestjs/config";
import { BaseHttpClient } from "../common/http-client";
import { ServicesConfig } from "../config/services.config";

@Controller()
export class GatewayController {
  constructor(
    private readonly httpClient: BaseHttpClient,
    @Inject(ServicesConfig.KEY)
    private readonly servicesConfig: Record<string, string>,
  ) {}

  @All("auth/*")
  async routeAuth(@Req() req: any) {
    return this.forward(this.servicesConfig.auth, req, "auth");
  }

  @All("users/*")
  async routeUsers(@Req() req: any) {
    return this.forward(this.servicesConfig.user, req, "users");
  }

  @All("products/*")
  async routeProducts(@Req() req: any) {
    return this.forward(this.servicesConfig.product, req, "products");
  }

  @All("search/*")
  async routeSearch(@Req() req: any) {
    return this.forward(this.servicesConfig.search, req, "search");
  }

  @All("cart/*")
  async routeCart(@Req() req: any) {
    return this.forward(this.servicesConfig.cart, req, "cart");
  }

  @All("inventory/*")
  async routeInventory(@Req() req: any) {
    return this.forward(this.servicesConfig.inventory, req, "inventory");
  }

  @All("orders/*")
  async routeOrders(@Req() req: any) {
    return this.forward(this.servicesConfig.order, req, "orders");
  }

  @All("payments/*")
  async routePayments(@Req() req: any) {
    return this.forward(this.servicesConfig.payment, req, "payments");
  }

  @All("notifications/*")
  async routeNotifications(@Req() req: any) {
    return this.forward(this.servicesConfig.notification, req, "notifications");
  }

  /**
   * Normalizes the route path and forwards it using the BaseHttpClient.
   */
  private async forward(baseUrl: string, req: Request, prefix: string) {
    if (!baseUrl) {
      throw new HttpException(
        `Service ${prefix} is not configured`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Strip the primary prefix parameter (e.g. /auth/login -> /login)
    // Or preserve it depending on downstream expectations. We will pass it exactly, letting downstream controllers match their bound paths.
    // If the requirement states API Gateway strips prefixes, we slice them. Assumption: We preserve path structure for standard microservices.

    // Example: GET /auth/login -> http://auth-service:3001/auth/login
    const targetUrl = `${baseUrl}${req.url}`;

    return this.httpClient.forwardRequest(targetUrl, req);
  }
}

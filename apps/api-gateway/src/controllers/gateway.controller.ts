import {
  Controller,
  Get,
  Param,
  All,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpClient } from '../common/http-client';
import type { GatewayRequest } from '../common/types';
import { Public } from '../common/decorators/public.decorator';

import { ProductPageService } from '../modules/aggregation/product-page.service';
import { CartSummaryService } from '../modules/aggregation/cart-summary.service';
import { OrderDetailsService } from '../modules/aggregation/order-details.service';

@Controller()
export class GatewayController {
  constructor(
    private readonly httpClient: BaseHttpClient,
    private readonly configService: ConfigService,
    private readonly productPageService: ProductPageService,
    private readonly cartSummaryService: CartSummaryService,
    private readonly orderDetailsService: OrderDetailsService,
  ) {}

  // ── Aggregation endpoints ──────────────────────────────────────────────────

  @Public()
  @Get('product-page/:id')
  async getProductPage(@Param('id') id: string, @Req() req: GatewayRequest) {
    return this.productPageService.getPage(id, req);
  }

  @Get('cart-summary')
  async getCartSummary(@Req() req: GatewayRequest) {
    return this.cartSummaryService.getSummary(req);
  }

  @Get('order-details/:id')
  async getOrderDetails(@Param('id') id: string, @Req() req: GatewayRequest) {
    return this.orderDetailsService.getDetails(id, req);
  }

  // ── Proxy / forwarding routes ──────────────────────────────────────────────

  /** auth/* is public — login, register, refresh token, etc. */
  @Public()
  @All('auth/*')
  async routeAuth(@Req() req: GatewayRequest) {
    return this.forward(
      this.configService.get<string>('gateway.services.auth'),
      req,
      'auth',
    );
  }

  @All('users/*')
  async routeUsers(@Req() req: GatewayRequest) {
    return this.forward(
      this.configService.get<string>('gateway.services.user'),
      req,
      'users',
    );
  }

  /** products/* is public — browsing requires no account */
  @Public()
  @All('products/*')
  async routeProducts(@Req() req: GatewayRequest) {
    return this.forward(
      this.configService.get<string>('gateway.services.product'),
      req,
      'products',
    );
  }

  /** search/* is public — searching requires no account */
  @Public()
  @All('search/*')
  async routeSearch(@Req() req: GatewayRequest) {
    return this.forward(
      this.configService.get<string>('gateway.services.search'),
      req,
      'search',
    );
  }

  @All('cart/*')
  async routeCart(@Req() req: GatewayRequest) {
    return this.forward(
      this.configService.get<string>('gateway.services.cart'),
      req,
      'cart',
    );
  }

  @All('inventory/*')
  async routeInventory(@Req() req: GatewayRequest) {
    return this.forward(
      this.configService.get<string>('gateway.services.inventory'),
      req,
      'inventory',
    );
  }

  @All('orders/*')
  async routeOrders(@Req() req: GatewayRequest) {
    return this.forward(
      this.configService.get<string>('gateway.services.order'),
      req,
      'orders',
    );
  }

  @All('payments/*')
  async routePayments(@Req() req: GatewayRequest) {
    return this.forward(
      this.configService.get<string>('gateway.services.payment'),
      req,
      'payments',
    );
  }

  @All('notifications/*')
  async routeNotifications(@Req() req: GatewayRequest) {
    return this.forward(
      this.configService.get<string>('gateway.services.notification'),
      req,
      'notifications',
    );
  }

  /**
   * Normalizes the route path and forwards it using the BaseHttpClient.
   */
  private async forward(
    baseUrl: string | undefined,
    req: GatewayRequest,
    prefix: string,
  ) {
    if (!baseUrl) {
      throw new HttpException(
        `Service ${prefix} is not configured`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const targetUrl = `${baseUrl}${req.url}`;
    return this.httpClient.forwardRequest(targetUrl, req);
  }
}

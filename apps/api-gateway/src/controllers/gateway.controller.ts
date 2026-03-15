import {
  Controller,
  Get,
  Param,
  All,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
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

  @ApiTags('Aggregation')
  @ApiOperation({
    summary: 'Get product page (BFF aggregate)',
    description:
      'Aggregates product details, reviews, inventory, and related products into a single response. No authentication required.',
  })
  @ApiParam({ name: 'id', description: 'Product ID', example: 'prod-123' })
  @ApiResponse({ status: 200, description: 'Aggregated product page data' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @Public()
  @Get('product-page/:id')
  async getProductPage(@Param('id') id: string, @Req() req: GatewayRequest) {
    return this.productPageService.getPage(id, req);
  }

  @ApiTags('Aggregation')
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Get cart summary (BFF aggregate)',
    description:
      'Aggregates cart line items with product details and pricing into a single response.',
  })
  @ApiResponse({ status: 200, description: 'Aggregated cart summary' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Get('cart-summary')
  async getCartSummary(@Req() req: GatewayRequest) {
    return this.cartSummaryService.getSummary(req);
  }

  @ApiTags('Aggregation')
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Get order details (BFF aggregate)',
    description:
      'Aggregates order data with product snapshots, delivery status, and payment info.',
  })
  @ApiParam({ name: 'id', description: 'Order ID', example: 'order-456' })
  @ApiResponse({ status: 200, description: 'Aggregated order details' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @Get('order-details/:id')
  async getOrderDetails(@Param('id') id: string, @Req() req: GatewayRequest) {
    return this.orderDetailsService.getDetails(id, req);
  }

  // ── Proxy / forwarding routes ──────────────────────────────────────────────

  @ApiTags('Auth')
  @ApiOperation({
    summary: '🔓 Auth service proxy',
    description:
      'Proxies all requests to the Auth Service (login, register, refresh, logout). No authentication required.',
  })
  @ApiResponse({ status: 200, description: 'Response from Auth Service' })
  @Public()
  @All('auth/*path')
  async routeAuth(@Req() req: GatewayRequest) {
    return this.forward(
      this.configService.get<string>('gateway.services.auth'),
      req,
      'auth',
    );
  }

  @ApiTags('Users')
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'User service proxy',
    description: 'Proxies all requests to the User Service.',
  })
  @ApiResponse({ status: 200, description: 'Response from User Service' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @All('users/*path')
  async routeUsers(@Req() req: GatewayRequest) {
    return this.forward(
      this.configService.get<string>('gateway.services.user'),
      req,
      'users',
    );
  }

  @ApiTags('Products')
  @ApiOperation({
    summary: '🔓 Product service proxy',
    description:
      'Proxies all requests to the Product Service. No authentication required.',
  })
  @ApiResponse({ status: 200, description: 'Response from Product Service' })
  @Public()
  @All('products/*path')
  async routeProducts(@Req() req: GatewayRequest) {
    return this.forward(
      this.configService.get<string>('gateway.services.product'),
      req,
      'products',
    );
  }

  @ApiTags('Search')
  @ApiOperation({
    summary: '🔓 Search service proxy',
    description:
      'Proxies all requests to the Search Service. No authentication required.',
  })
  @ApiResponse({ status: 200, description: 'Response from Search Service' })
  @Public()
  @All('search/*path')
  async routeSearch(@Req() req: GatewayRequest) {
    return this.forward(
      this.configService.get<string>('gateway.services.search'),
      req,
      'search',
    );
  }

  @ApiTags('Cart')
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Cart service proxy',
    description: 'Proxies all requests to the Cart Service.',
  })
  @ApiResponse({ status: 200, description: 'Response from Cart Service' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @All('cart/*path')
  async routeCart(@Req() req: GatewayRequest) {
    return this.forward(
      this.configService.get<string>('gateway.services.cart'),
      req,
      'cart',
    );
  }

  @ApiTags('Inventory')
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Inventory service proxy',
    description: 'Proxies all requests to the Inventory Service.',
  })
  @ApiResponse({ status: 200, description: 'Response from Inventory Service' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @All('inventory/*path')
  async routeInventory(@Req() req: GatewayRequest) {
    return this.forward(
      this.configService.get<string>('gateway.services.inventory'),
      req,
      'inventory',
    );
  }

  @ApiTags('Orders')
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Order service proxy',
    description: 'Proxies all requests to the Order Service.',
  })
  @ApiResponse({ status: 200, description: 'Response from Order Service' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @All('orders/*path')
  async routeOrders(@Req() req: GatewayRequest) {
    return this.forward(
      this.configService.get<string>('gateway.services.order'),
      req,
      'orders',
    );
  }

  @ApiTags('Payments')
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Payment service proxy',
    description: 'Proxies all requests to the Payment Service.',
  })
  @ApiResponse({ status: 200, description: 'Response from Payment Service' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @All('payments/*path')
  async routePayments(@Req() req: GatewayRequest) {
    return this.forward(
      this.configService.get<string>('gateway.services.payment'),
      req,
      'payments',
    );
  }

  @ApiTags('Notifications')
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Notification service proxy',
    description: 'Proxies all requests to the Notification Service.',
  })
  @ApiResponse({ status: 200, description: 'Response from Notification Service' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @All('notifications/*path')
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

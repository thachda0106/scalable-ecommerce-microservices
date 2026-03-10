import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProxyService } from './proxy.service';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller()
export class ProxyController {
  constructor(
    private readonly proxyService: ProxyService,
    private readonly configService: ConfigService,
  ) {}

  @All('auth/*')
  async proxyAuth(@Req() req: Request, @Res() res: Response) {
    const serviceUrl = this.configService.get<string>('services.auth');
    // Auth bypasses JWT check typically (or is handled internally by auth-service)
    return this.proxyService.forwardRequest(req, res, serviceUrl!);
  }

  @UseGuards(JwtAuthGuard)
  @All('users/*')
  async proxyUsers(@Req() req: Request, @Res() res: Response) {
    const serviceUrl = this.configService.get<string>('services.user');
    this.injectIdentityHeaders(req);
    return this.proxyService.forwardRequest(req, res, serviceUrl!);
  }

  @All('products/*')
  async proxyProducts(@Req() req: Request, @Res() res: Response) {
    const serviceUrl = this.configService.get<string>('services.product');
    // Public route, but could read optional JWT
    this.injectIdentityHeadersSafe(req);
    return this.proxyService.forwardRequest(req, res, serviceUrl!);
  }

  @All('search/*')
  async proxySearch(@Req() req: Request, @Res() res: Response) {
    const serviceUrl = this.configService.get<string>('services.search');
    return this.proxyService.forwardRequest(req, res, serviceUrl!);
  }

  @UseGuards(JwtAuthGuard)
  @All('cart/*')
  async proxyCart(@Req() req: Request, @Res() res: Response) {
    const serviceUrl = this.configService.get<string>('services.cart');
    this.injectIdentityHeaders(req);
    return this.proxyService.forwardRequest(req, res, serviceUrl!);
  }

  @UseGuards(JwtAuthGuard)
  @All('orders/*')
  async proxyOrders(@Req() req: Request, @Res() res: Response) {
    const serviceUrl = this.configService.get<string>('services.order');
    this.injectIdentityHeaders(req);
    return this.proxyService.forwardRequest(req, res, serviceUrl!);
  }

  @UseGuards(JwtAuthGuard)
  @All('payments/*')
  async proxyPayments(@Req() req: Request, @Res() res: Response) {
    const serviceUrl = this.configService.get<string>('services.payment');
    this.injectIdentityHeaders(req);
    return this.proxyService.forwardRequest(req, res, serviceUrl!);
  }

  @UseGuards(JwtAuthGuard)
  @All('inventory/*')
  async proxyInventory(@Req() req: Request, @Res() res: Response) {
    const serviceUrl = this.configService.get<string>('services.inventory');
    this.injectIdentityHeaders(req);
    return this.proxyService.forwardRequest(req, res, serviceUrl!);
  }

  @UseGuards(JwtAuthGuard)
  @All('notifications/*')
  async proxyNotifications(@Req() req: Request, @Res() res: Response) {
    const serviceUrl = this.configService.get<string>('services.notification');
    this.injectIdentityHeaders(req);
    return this.proxyService.forwardRequest(req, res, serviceUrl!);
  }

  /**
   * Helper to set headers for downstream services based on decoded JWT user payload
   */
  private injectIdentityHeaders(req: Request) {
    if (req.user) {
      const u = req.user as any;
      req.headers['x-user-id'] = u.userId;
      if (u.roles) {
        req.headers['x-user-roles'] = Array.isArray(u.roles)
          ? u.roles.join(',')
          : u.roles;
      }
    }
  }

  private injectIdentityHeadersSafe(req: Request) {
    if (req.user) {
      this.injectIdentityHeaders(req);
    }
  }
}

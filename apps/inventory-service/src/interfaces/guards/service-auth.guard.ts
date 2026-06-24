import {
  Injectable,
  Inject,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { verifyInternalHeaders } from '@ecommerce/core';
import { Logger } from '@ecommerce/core';

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'] as string | undefined;
    const serviceToken = request.headers['x-service-token'] as string | undefined;
    const authHeader = request.headers['authorization'] as string | undefined;

    // Internal service API key (simple shared secret — for dev/test)
    if (apiKey && apiKey === process.env.INTERNAL_API_KEY) {
      return true;
    }

    // Service-to-service token
    if (serviceToken) {
      this.logger.warn('x-service-token auth not implemented — use HMAC headers');
      throw new UnauthorizedException('Service token auth not supported');
    }

    // Gateway-forwarded JWT with HMAC identity headers
    if (authHeader?.startsWith('Bearer ')) {
      return this.validateInternalAuth(request);
    }

    this.logger.warn('Unauthorized service request');
    throw new UnauthorizedException('Service authentication required');
  }

  private validateInternalAuth(request: Request): boolean {
    const secret = process.env.INTERNAL_AUTH_SECRET;
    if (!secret) {
      throw new UnauthorizedException('Internal auth not configured');
    }

    const headers: Record<string, string | undefined> = {
      'x-user-id': request.headers['x-user-id'] as string | undefined,
      'x-user-roles': request.headers['x-user-roles'] as string | undefined,
      'x-internal-timestamp': request.headers['x-internal-timestamp'] as string | undefined,
      'x-internal-signature': request.headers['x-internal-signature'] as string | undefined,
    };

    if (!verifyInternalHeaders(headers, secret)) {
      this.logger.warn('HMAC signature verification failed');
      throw new UnauthorizedException('Invalid internal authentication');
    }

    return true;
  }
}

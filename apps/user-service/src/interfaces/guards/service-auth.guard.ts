import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * Authenticates incoming requests via API key, service token, or gateway-forwarded JWT.
 * Mirrors the pattern used by inventory-service's ServiceAuthGuard.
 */
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  private readonly logger = new Logger(ServiceAuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'] as string | undefined;
    const serviceToken = request.headers['x-service-token'] as
      | string
      | undefined;
    const authHeader = request.headers['authorization'];

    // Internal service API key
    if (apiKey && apiKey === process.env.INTERNAL_API_KEY) {
      return true;
    }

    // Service-to-service token
    if (serviceToken) {
      // TODO: Validate service JWT with auth-service
      return true;
    }

    // Gateway-forwarded JWT (gateway already validated it)
    if (authHeader?.startsWith('Bearer ')) {
      return true;
    }

    this.logger.warn('Unauthorized request — no valid credentials');
    throw new UnauthorizedException('Authentication required');
  }
}

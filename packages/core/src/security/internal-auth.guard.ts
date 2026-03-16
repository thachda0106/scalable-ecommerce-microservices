import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyInternalHeaders } from './internal-auth';

const IS_PUBLIC_KEY = 'isPublic';

/**
 * NestJS Guard that verifies HMAC-signed internal headers.
 * Apply globally or per-controller in downstream services.
 *
 * Routes decorated with @Public() skip verification.
 *
 * Requires INTERNAL_AUTH_SECRET environment variable.
 */
@Injectable()
export class InternalAuthGuard implements CanActivate {
  private readonly logger = new Logger(InternalAuthGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Skip for @Public() routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const secret = process.env.INTERNAL_AUTH_SECRET;

    if (!secret) {
      this.logger.warn('INTERNAL_AUTH_SECRET not set — skipping verification in non-production');
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Internal auth not configured');
      }
      return true; // Allow in dev without secret
    }

    const headers: Record<string, string | undefined> = {
      'x-user-id': request.headers['x-user-id'] as string | undefined,
      'x-internal-timestamp': request.headers['x-internal-timestamp'] as string | undefined,
      'x-internal-signature': request.headers['x-internal-signature'] as string | undefined,
    };

    if (!verifyInternalHeaders(headers, secret)) {
      this.logger.warn('Internal auth verification failed — rejecting request');
      throw new UnauthorizedException('Invalid internal authentication');
    }

    return true;
  }
}

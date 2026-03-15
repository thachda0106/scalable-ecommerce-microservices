import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * Lightweight guard that enforces cart ownership.
 *
 * The API Gateway validates JWTs and forwards the authenticated user's ID
 * as the `x-user-id` header. This guard:
 *   1. Ensures the header is present (rejects unauthenticated requests)
 *   2. Compares it to the `:userId` route parameter (prevents cross-user access)
 */
@Injectable()
export class UserIdGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const headerUserId = request.headers['x-user-id'] as string | undefined;

    if (!headerUserId) {
      throw new UnauthorizedException('Missing x-user-id header');
    }

    const paramUserId = request.params['userId'];
    if (paramUserId && headerUserId !== paramUserId) {
      throw new ForbiddenException("Cannot access another user's cart");
    }

    // Attach for downstream use
    (request as any).userId = headerUserId;
    return true;
  }
}

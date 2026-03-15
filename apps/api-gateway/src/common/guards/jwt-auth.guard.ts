import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedUser } from './jwt.strategy';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Check if the route or its controller is marked as @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), // route-level decorator takes priority
      context.getClass(), // then controller-level
    ]);

    if (isPublic) {
      return true; // bypass JWT validation entirely
    }

    return super.canActivate(context);
  }

  // Matches the base IAuthGuard generic signature — `any` params are required
  // by the Passport contract and cannot be narrowed further at the override level.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleRequest<TUser = AuthenticatedUser>(err: any, user: any): TUser {
    if (err || !user) {
      throw err instanceof Error
        ? err
        : new UnauthorizedException('Authentication failed');
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return user as TUser;
  }
}

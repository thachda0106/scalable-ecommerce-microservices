import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Add custom authentication logic here if needed
    // e.g., checking specific public routes bypass

    return super.canActivate(context);
  }

  handleRequest(err: unknown, user: unknown) {
    if (err || !user) {
      throw err instanceof Error
        ? err
        : new UnauthorizedException('Authentication failed');
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return user as any;
  }
}

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  private readonly logger = new Logger(ServiceAuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    const serviceToken = request.headers['x-service-token'];
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

    // Gateway-forwarded JWT
    if (authHeader?.startsWith('Bearer ')) {
      // TODO: Full JWT verification via auth-service
      return true;
    }

    this.logger.warn('Unauthorized service request');
    throw new UnauthorizedException('Service authentication required');
  }
}

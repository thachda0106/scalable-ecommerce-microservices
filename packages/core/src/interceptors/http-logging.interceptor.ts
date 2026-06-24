import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(@Inject(Logger) private readonly logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const { method, originalUrl } = req;
    const userAgent = req.get('user-agent') || '-';
    const correlationId =
      (req.headers['x-correlation-id'] as string) ||
      (req.headers['x-request-id'] as string) ||
      '-';

    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const latencyMs = Date.now() - now;
          const { statusCode } = res;
          this.logger.log(
            `[${correlationId}] ${method} ${originalUrl} ${statusCode} - ${userAgent} [${latencyMs}ms]`,
          );
        },
        error: (error: unknown) => {
          const latencyMs = Date.now() - now;
          const errMsg = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `[${correlationId}] ${method} ${originalUrl} FAILED - ${userAgent} [${latencyMs}ms] ${errMsg}`,
          );
        },
      }),
    );
  }
}

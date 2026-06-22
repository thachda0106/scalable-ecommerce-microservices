import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { Counter, Histogram, register } from 'prom-client';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly requestCounter: Counter;
  private readonly durationHistogram: Histogram;
  private readonly errorCounter: Counter;

  constructor(private readonly serviceName: string) {
    this.requestCounter =
      (register.getSingleMetric('http_request_total') as Counter) ||
      new Counter({
        name: 'http_request_total',
        help: 'Total number of HTTP requests',
        labelNames: ['service', 'method', 'path', 'status'],
      });

    this.durationHistogram =
      (register.getSingleMetric('http_request_duration_seconds') as Histogram) ||
      new Histogram({
        name: 'http_request_duration_seconds',
        help: 'Duration of HTTP requests in seconds',
        labelNames: ['service', 'method', 'path'],
        buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      });

    this.errorCounter =
      (register.getSingleMetric('http_request_errors_total') as Counter) ||
      new Counter({
        name: 'http_request_errors_total',
        help: 'Total number of failed HTTP requests',
        labelNames: ['service', 'method', 'path', 'error_type'],
      });
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const path = this.normalizePath(req.route?.path || req.path);
    const method = req.method;
    const labels = { service: this.serviceName, method, path };

    const endTimer = this.durationHistogram.startTimer(labels);

    return next.handle().pipe(
      tap(() => {
        endTimer();
        this.requestCounter.inc({
          ...labels,
          status: res.statusCode.toString(),
        });
      }),
      catchError((error: unknown) => {
        endTimer();
        const err = error as { status?: number; getStatus?: () => number; name?: string };
        let status = '500';
        if (err.status) status = err.status.toString();
        else if (err.getStatus && typeof err.getStatus === 'function') {
          status = err.getStatus().toString();
        }

        this.requestCounter.inc({ ...labels, status });
        this.errorCounter.inc({
          ...labels,
          error_type: (err as Error).name || 'UnknownError',
        });

        return throwError(() => error);
      }),
    );
  }

  /**
   * Normalize paths to prevent Prometheus cardinality explosion.
   * Handles Express :param patterns and UUID/hex-based path segments.
   */
  private normalizePath(path: string): string {
    let normalized = path.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
    normalized = normalized.replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      '{uuid}',
    );
    normalized = normalized.replace(
      /\b[0-9a-f]{24}\b/gi,
      '{objectId}',
    );
    return normalized;
  }
}

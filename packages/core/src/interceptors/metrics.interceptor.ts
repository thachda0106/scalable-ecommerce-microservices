import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { Counter, Histogram } from 'prom-client';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly requestCounter: Counter;
  private readonly durationHistogram: Histogram;
  private readonly errorCounter: Counter;

  constructor(private readonly serviceName: string) {
    // We register these in a singleton way to avoid duplicate metric registration errors
    // if the interceptor is instantiated multiple times.

    const promClient = require('prom-client');
    const register = promClient.register;

    this.requestCounter =
      register.getSingleMetric('http_request_total') ||
      new Counter({
        name: 'http_request_total',
        help: 'Total number of HTTP requests',
        labelNames: ['service', 'method', 'path', 'status'],
      });

    this.durationHistogram =
      register.getSingleMetric('http_request_duration_seconds') ||
      new Histogram({
        name: 'http_request_duration_seconds',
        help: 'Duration of HTTP requests in seconds',
        labelNames: ['service', 'method', 'path'],
        buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      });

    this.errorCounter =
      register.getSingleMetric('http_request_errors_total') ||
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
      catchError((error: any) => {
        endTimer();
        let status = '500';
        if (error.status) status = error.status.toString();
        else if (error.getStatus && typeof error.getStatus === 'function') {
          status = error.getStatus().toString();
        }

        this.requestCounter.inc({ ...labels, status });
        this.errorCounter.inc({
          ...labels,
          error_type: error.name || 'UnknownError',
        });

        return throwError(() => error);
      }),
    );
  }

  /**
   * Replace express path params like :id with generalized {id} pattern
   * to avoid cardinality explosion in Prometheus.
   */
  private normalizePath(path: string): string {
    return path.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
  }
}

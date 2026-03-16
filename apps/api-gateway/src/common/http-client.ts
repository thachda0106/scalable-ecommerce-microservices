import { Injectable, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Request } from 'express';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig, AxiosError, AxiosResponse } from 'axios';
import CircuitBreaker from 'opossum';
import { randomUUID } from 'crypto';
import { signInternalHeaders } from '@ecommerce/core';

@Injectable()
export class BaseHttpClient {
  private breaker: CircuitBreaker<[AxiosRequestConfig], AxiosResponse>;

  constructor(private readonly httpService: HttpService) {
    const breakerOptions = {
      timeout: 4000, // Timeout slightly under the global 5000ms interceptor
      errorThresholdPercentage: 50, // Open breaker if 50% operations fail
      resetTimeout: 10000, // Retry after 10 seconds
    };

    this.breaker = new CircuitBreaker(
      (config: AxiosRequestConfig) => this.executeRequest(config),
      breakerOptions,
    );
    this.breaker.fallback(() => Promise.reject(new Error('Breaker is open')));
  }

  /**
   * Simple GET for aggregation services — avoids the need to pass a full Request object.
   */
  async directGet(
    url: string,
    headers: Record<string, string> = {},
  ): Promise<unknown> {
    const config: AxiosRequestConfig = {
      method: 'GET',
      url,
      headers,
    };

    return this.execute(config);
  }

  /**
   * Forwards a request to a downstream service, preserving traceability headers.
   */
  async forwardRequest(
    targetUrl: string,
    req: Request,
    additionalHeaders: Record<string, string> = {},
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      ...additionalHeaders,
    };

    // Propagate x-request-id from middleware
    if (req.headers['x-request-id']) {
      headers['x-request-id'] = req.headers['x-request-id'] as string;
    }

    // Propagate x-correlation-id (generate if missing)
    const correlationId =
      (req.headers['x-request-id'] as string) ||
      (req.headers['x-correlation-id'] as string) ||
      randomUUID();
    headers['x-correlation-id'] = correlationId;

    // Propagate Authorization header if present
    if (req.headers.authorization) {
      headers.authorization = req.headers.authorization;
    }

    // Propagate decoded Identity headers from JwtAuthGuard + HMAC sign
    if (req.user) {
      const user = req.user as { userId?: string; roles?: string[] | string };
      const userId = user.userId || '';
      const roles = Array.isArray(user.roles)
        ? user.roles
        : user.roles
          ? [user.roles]
          : [];

      const internalSecret = process.env.INTERNAL_AUTH_SECRET;
      if (internalSecret && userId) {
        // HMAC-sign the identity headers for downstream verification
        const signedHeaders = signInternalHeaders(userId, roles, internalSecret);
        Object.assign(headers, signedHeaders);
      } else {
        // Fallback: forward unsigned identity headers (dev mode)
        if (userId) headers['x-user-id'] = userId;
        if (roles.length > 0) headers['x-user-roles'] = roles.join(',');
      }
    }

    const config: AxiosRequestConfig = {
      method: req.method,
      url: targetUrl,
      headers,
      data: req.method !== 'GET' ? (req.body as unknown) : undefined,
      params: req.query,
    };

    return this.execute(config);
  }

  /**
   * Executes a request through the circuit breaker with common error handling.
   */
  private async execute(config: AxiosRequestConfig): Promise<unknown> {
    try {
      const response = await this.breaker.fire(config);
      return response.data;
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'Breaker is open') {
        throw new HttpException(
          'Service Temporarily Unavailable (Fast Fallback)',
          503,
        );
      }
      if (error instanceof AxiosError && error.response) {
        throw new HttpException(
          error.response.data as Record<string, unknown>,
          error.response.status,
        );
      }
      throw new HttpException('Internal Gateway Error', 500);
    }
  }

  /**
   * Actual HTTP call wrapped by the circuit breaker.
   */
  private async executeRequest(
    config: AxiosRequestConfig,
  ): Promise<AxiosResponse> {
    return firstValueFrom(this.httpService.request(config));
  }
}

import { Injectable, HttpException } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { Request } from "express";
import { firstValueFrom } from "rxjs";
import { AxiosRequestConfig, AxiosError } from "axios";
import CircuitBreaker from "opossum";

@Injectable()
export class BaseHttpClient {
  private breaker: CircuitBreaker;

  constructor(private readonly httpService: HttpService) {
    const breakerOptions = {
      timeout: 4000, // Timeout slightly under the global 5000ms interceptor
      errorThresholdPercentage: 50, // Open breaker if 50% operations fail
      resetTimeout: 10000, // Retry after 10 seconds
    };

    // Bind executeRequest context correctly to this instance
    this.breaker = new CircuitBreaker(
      this.executeRequest.bind(this),
      breakerOptions,
    );
    this.breaker.fallback(() => Promise.reject(new Error("Breaker is open")));
  }

  /**
   * Forwards a request to a downstream service, preserving traceability headers.
   */
  async forwardRequest(
    targetUrl: string,
    req: Request,
    additionalHeaders: Record<string, string> = {},
  ): Promise<any> {
    const headers: Record<string, string> = {
      ...additionalHeaders,
    };

    // Propagate x-request-id from middleware
    if (req.headers["x-request-id"]) {
      headers["x-request-id"] = req.headers["x-request-id"] as string;
    }

    // Propagate Authorization header if present
    if (req.headers.authorization) {
      headers.authorization = req.headers.authorization;
    }

    // Propagate decoded Identity headers from JwtAuthGuard
    if (req.user) {
      const user = req.user as any;
      if (user.userId) {
        headers["x-user-id"] = user.userId;
      }
      if (user.roles) {
        headers["x-user-roles"] = Array.isArray(user.roles)
          ? user.roles.join(",")
          : user.roles;
      }
    }

    const config: AxiosRequestConfig = {
      method: req.method,
      url: targetUrl,
      headers,
      data: req.method !== "GET" ? req.body : undefined,
      params: req.query,
    };

    try {
      // Execute the request via the initialized circuit breaker
      const response: any = await this.breaker.fire(config);
      return response.data;
    } catch (error) {
      if (error instanceof Error && error.message === "Breaker is open") {
        throw new HttpException(
          "Service Temporarily Unavailable (Fast Fallback)",
          503,
        );
      }
      if (error.response) {
        throw new HttpException(error.response.data, error.response.status);
      }
      throw new HttpException("Internal Gateway Error", 500);
    }
  }

  /**
   * Actual HTTP call wrapped by the circuit breaker.
   */
  private async executeRequest(config: AxiosRequestConfig): Promise<any> {
    return firstValueFrom(this.httpService.request(config));
  }
}

import { Injectable, HttpException } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { Request } from "express";
import { firstValueFrom } from "rxjs";
import { AxiosRequestConfig, AxiosError } from "axios";

@Injectable()
export class BaseHttpClient {
  constructor(private readonly httpService: HttpService) {}

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
      const response = await firstValueFrom(this.httpService.request(config));
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        throw new HttpException(error.response.data, error.response.status);
      }
      throw new HttpException("Internal Gateway Error", 500);
    }
  }
}

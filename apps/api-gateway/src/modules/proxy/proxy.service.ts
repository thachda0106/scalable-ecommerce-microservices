import {
  Injectable,
  Logger,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import type { Request, Response } from 'express';
import { lastValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async forwardRequest(req: Request, res: Response, serviceUrl: string) {
    const { method, url, body, headers } = req;
    const targetUrl = `${serviceUrl}${url}`;

    this.logger.debug(`Forwarding ${method} ${url} to ${targetUrl}`);

    // Clean headers
    const forwardHeaders = { ...headers };
    delete forwardHeaders.host;
    delete forwardHeaders.connection;
    delete forwardHeaders['content-length'];

    try {
      const response = await lastValueFrom(
        this.httpService
          .request({
            method: method as any,
            url: targetUrl,
            data: body,
            headers: forwardHeaders as any,
            // Axios doesn't throw on 4xx/5xx by default if we want to pipe response,
            // but we'll let it throw so we can normalize via the gateway filter.
          })
          .pipe(
            catchError((error) => {
              this.logger.error(
                `Error proxying to ${targetUrl}: ${error.message}`,
              );
              if (error.response) {
                throw new HttpException(
                  error.response.data,
                  error.response.status,
                );
              }
              throw new InternalServerErrorException(
                'Downstream service unreachable',
              );
            }),
          ),
      );

      return res.status(response.status).send(response.data);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Error forwarding request');
    }
  }
}

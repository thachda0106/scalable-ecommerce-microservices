import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorMessage: unknown =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: (exception as Error).message || 'Internal Server Error' };

    const errorResponse = {
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      path: httpAdapter.getRequestUrl(ctx.getRequest()),
      ...(typeof errorMessage === 'string'
        ? { message: errorMessage }
        : (errorMessage as Record<string, unknown>)),
    };

    if (httpStatus >= 500) {
      this.logger.error(
        `Exception on ${errorResponse.path}: ${JSON.stringify(errorResponse)}`,
        (exception as Error).stack,
      );
    } else {
      this.logger.warn(
        `Exception on ${errorResponse.path}: ${JSON.stringify(errorResponse)}`,
      );
    }

    httpAdapter.reply(ctx.getResponse(), errorResponse, httpStatus);
  }
}

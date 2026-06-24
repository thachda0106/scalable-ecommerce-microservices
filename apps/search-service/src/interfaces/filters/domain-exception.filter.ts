import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Response } from 'express';
import { Logger } from '@ecommerce/core';
import { SearchException } from '../../domain/errors/search-exception';
import { IndexNotFoundError } from '../../domain/errors/index-not-found.error';
import { InvalidSearchQueryError } from '../../domain/errors/invalid-search-query.error';

@Catch(SearchException)
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(@Inject(Logger) private readonly logger: Logger) {}

  catch(exception: SearchException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const statusCode = this.getStatusCode(exception);

    this.logger.warn(
      `Domain exception: ${exception.name} - ${exception.message}`,
    );

    response.status(statusCode).json({
      statusCode,
      error: exception.name,
      message: exception.message,
    });
  }

  private getStatusCode(exception: SearchException): number {
    if (exception instanceof IndexNotFoundError) {
      return HttpStatus.NOT_FOUND;
    }
    if (exception instanceof InvalidSearchQueryError) {
      return HttpStatus.BAD_REQUEST;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}

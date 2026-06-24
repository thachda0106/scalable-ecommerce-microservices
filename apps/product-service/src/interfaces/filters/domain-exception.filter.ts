import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { Response } from 'express';
import { DomainException } from '../../domain/errors/domain-exception';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
import { InvalidProductStatusTransitionError } from '../../domain/errors/invalid-product-status-transition.error';
import { InvalidProductOperationError } from '../../domain/errors/invalid-product-operation.error';

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(@Inject(Logger) private readonly logger: Logger) {}

  catch(exception: DomainException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const statusCode = this.getStatusCode(exception);

    this.logger.warn(
      `Domain exception: ${exception.code} - ${exception.message}`,
    );

    response.status(statusCode).json({
      statusCode,
      error: exception.code,
      message: exception.message,
    });
  }

  private getStatusCode(exception: DomainException): number {
    if (exception instanceof ProductNotFoundError) {
      return HttpStatus.NOT_FOUND;
    }
    if (exception instanceof InvalidProductStatusTransitionError) {
      return HttpStatus.BAD_REQUEST;
    }
    if (exception instanceof InvalidProductOperationError) {
      return HttpStatus.BAD_REQUEST;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}

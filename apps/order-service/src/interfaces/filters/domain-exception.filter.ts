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
import { InvalidOrderStatusTransitionError } from '../../domain/errors/invalid-order-status-transition.error';
import { InvalidOrderOperationError } from '../../domain/errors/invalid-order-operation.error';

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(@Inject(Logger) private readonly logger: Logger) {}

  catch(exception: DomainException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.BAD_REQUEST;
    if (exception instanceof InvalidOrderStatusTransitionError) {
      status = HttpStatus.CONFLICT;
    } else if (exception instanceof InvalidOrderOperationError) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
    }

    this.logger.warn(`Domain exception: ${exception.message}`);

    response.status(status).json({
      statusCode: status,
      error: exception.name,
      message: exception.message,
      timestamp: new Date().toISOString(),
    });
  }
}

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { Response } from 'express';
import {
  DomainException,
  InvalidPaymentStatusTransitionError,
  InvalidPaymentOperationError,
} from '../../domain/errors';

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(@Inject(Logger) private readonly logger: Logger) {}

  catch(exception: DomainException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    const message = exception.message;

    if (
      exception instanceof InvalidPaymentStatusTransitionError ||
      exception instanceof InvalidPaymentOperationError
    ) {
      status = HttpStatus.BAD_REQUEST;
    }

    this.logger.warn(`DomainException: ${message}`, exception.stack);

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      message: message,
      error: 'Domain Error',
    });
  }
}

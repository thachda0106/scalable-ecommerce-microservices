import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import {
  DomainException,
  InvalidPaymentStatusTransitionError,
  InvalidPaymentOperationError,
} from '../../domain/errors';

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

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

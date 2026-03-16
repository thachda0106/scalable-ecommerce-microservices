import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { DomainException } from '../../domain/errors/domain-exception';
import { InvalidOrderStatusTransitionError } from '../../domain/errors/invalid-order-status-transition.error';
import { InvalidOrderOperationError } from '../../domain/errors/invalid-order-operation.error';

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

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

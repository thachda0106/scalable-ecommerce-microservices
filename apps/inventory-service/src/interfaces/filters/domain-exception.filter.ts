import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { InsufficientStockError } from '../../domain/errors/insufficient-stock.error';
import { ReservationNotFoundError } from '../../domain/errors/reservation-not-found.error';
import { StockInvariantViolationError } from '../../domain/errors/stock-invariant-violation.error';

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof InsufficientStockError) {
      response.status(409).json({
        statusCode: 409,
        error: 'INSUFFICIENT_STOCK',
        message: exception.message,
        productId: exception.productId,
        requested: exception.requested,
        available: exception.available,
      });
      return;
    }

    if (exception instanceof ReservationNotFoundError) {
      response.status(404).json({
        statusCode: 404,
        error: 'RESERVATION_NOT_FOUND',
        message: exception.message,
      });
      return;
    }

    if (exception instanceof StockInvariantViolationError) {
      this.logger.error(
        `Stock invariant violation: ${exception.message}`,
        exception.stack,
      );
      response.status(500).json({
        statusCode: 500,
        error: 'STOCK_INVARIANT_VIOLATION',
        message: 'Internal inventory error',
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      response.status(status).json(exceptionResponse);
      return;
    }

    this.logger.error(
      `Unhandled exception: ${(exception as Error).message}`,
      (exception as Error).stack,
    );
    response.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
    });
  }
}

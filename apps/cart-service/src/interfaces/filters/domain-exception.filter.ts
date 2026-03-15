import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { DomainException } from '../../domain/exceptions';

/**
 * Maps domain-layer exceptions to HTTP responses.
 * This keeps the application/domain layers free of HTTP concerns.
 */
@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  private static readonly STATUS_MAP: Record<string, HttpStatus> = {
    CART_NOT_FOUND: HttpStatus.NOT_FOUND,
    ITEM_NOT_IN_CART: HttpStatus.NOT_FOUND,
    INVALID_QUANTITY: HttpStatus.BAD_REQUEST,
    INVALID_PRODUCT_ID: HttpStatus.BAD_REQUEST,
    CART_FULL: HttpStatus.UNPROCESSABLE_ENTITY,
    VERSION_CONFLICT: HttpStatus.CONFLICT,
    PRODUCT_NOT_FOUND: HttpStatus.UNPROCESSABLE_ENTITY,
    INSUFFICIENT_STOCK: HttpStatus.UNPROCESSABLE_ENTITY,
  };

  catch(exception: DomainException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      DomainExceptionFilter.STATUS_MAP[exception.code] ??
      HttpStatus.INTERNAL_SERVER_ERROR;

    this.logger.warn(
      `Domain exception [${exception.code}]: ${exception.message}`,
    );

    response.status(status).json({
      statusCode: status,
      error: exception.code,
      message: exception.message,
    });
  }
}

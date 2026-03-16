import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { DomainException } from '../../domain/errors/domain-exception';

/**
 * Maps domain-layer exceptions to HTTP responses.
 * Keeps application/domain layers free of HTTP concerns.
 * Matches the pattern used across cart-service and inventory-service.
 */
@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  private static readonly STATUS_MAP: Record<string, HttpStatus> = {
    // Validation errors
    INVALID_EMAIL: HttpStatus.BAD_REQUEST,
    INVALID_USERNAME: HttpStatus.BAD_REQUEST,
    INVALID_USER_ID: HttpStatus.BAD_REQUEST,

    // Business rule violations
    INVALID_USER_STATUS_TRANSITION: HttpStatus.CONFLICT,
    INVALID_USER_OPERATION: HttpStatus.UNPROCESSABLE_ENTITY,

    // Uniqueness violations
    USER_EMAIL_EXISTS: HttpStatus.CONFLICT,
    USER_USERNAME_EXISTS: HttpStatus.CONFLICT,

    // Concurrency
    VERSION_CONFLICT: HttpStatus.CONFLICT,

    // Generic
    DOMAIN_ERROR: HttpStatus.BAD_REQUEST,
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

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

interface StandardErrorResponse {
  success: boolean;
  code: string;
  message: string;
  details?: any;
  correlationId: string;
  timestamp: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId =
      (request.headers['x-correlation-id'] as string) ||
      (request.headers['x-request-id'] as string) ||
      randomUUID();

    const timestamp = new Date().toISOString();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: any = undefined;

    // Handle HttpException (NestJS standard)
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const responsePayload = exception.getResponse();

      if (typeof responsePayload === 'string') {
        message = responsePayload;
        code = `HTTP_${status}`;
      } else if (typeof responsePayload === 'object' && responsePayload !== null) {
        const payloadFields = responsePayload as any;
        message = payloadFields.message || exception.message;
        code = payloadFields.error ? payloadFields.error.toUpperCase().replace(/\s+/g, '_') : `HTTP_${status}`;
        if (payloadFields.message && Array.isArray(payloadFields.message)) {
          code = 'VALIDATION_ERROR';
          details = payloadFields.message;
          message = 'Validation failed';
        }
      }
    } 
    // Handle Domain Exceptions (checking for a 'code' property and custom name)
    else if (exception?.code && typeof exception.code === 'string') {
      code = exception.code;
      message = exception.message || message;
      
      // Default mapping for common domain error keywords
      if (code.includes('NOT_FOUND')) {
        status = HttpStatus.NOT_FOUND;
      } else if (code.includes('CONFLICT') || code.includes('EXISTS')) {
        status = HttpStatus.CONFLICT;
      } else if (code.includes('INVALID') || code.includes('FULL') || code.includes('INSUFFICIENT')) {
        status = HttpStatus.UNPROCESSABLE_ENTITY;
      } else {
        status = HttpStatus.BAD_REQUEST; // Default for domain errors if not mapped
      }
    } 
    // Generic Errors
    else if (exception instanceof Error) {
      message = exception.message;
      if (exception.name !== 'Error') {
        code = exception.name.toUpperCase().replace(/\s+/g, '_');
      }
    }

    const errorResponse: StandardErrorResponse = {
      success: false,
      code,
      message,
      ...(details ? { details } : {}),
      correlationId,
      timestamp, // included at the end to match standard log shapes
    };

    // Logging
    if (status >= 500) {
      this.logger.error(
        `[${correlationId}] ${request.method} ${request.url} - ${status} ${code}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `[${correlationId}] ${request.method} ${request.url} - ${status} ${code}: ${message}`,
      );
    }

    // Tracing
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(exception instanceof Error ? exception : new Error(message));
      span.setAttribute('error.correlation_id', correlationId);
      span.setAttribute('error.code', code);
      span.setAttribute('http.status_code', status);
    }

    response.status(status).json(errorResponse);
  }
}

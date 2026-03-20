import { GlobalExceptionFilter } from '../global-exception.filter';
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { trace } from '@opentelemetry/api';

jest.mock('@opentelemetry/api', () => ({
  trace: {
    getActiveSpan: jest.fn(),
  },
}));

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockRecordException: jest.Mock;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    mockRecordException = jest.fn();
    (trace.getActiveSpan as jest.Mock).mockReturnValue({
      recordException: mockRecordException,
      setAttribute: jest.fn(),
    });
  });

  const createMockHost = (headers: Record<string, string> = {}) => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const req = {
      headers,
      url: '/test',
    };
    return {
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => req,
      }),
    } as unknown as ArgumentsHost;
  };

  it('should handle HttpException automatically', () => {
    const mockHost = createMockHost();
    const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    
    filter.catch(exception, mockHost);
    
    const res = mockHost.switchToHttp().getResponse() as any;
    expect(res.status).toHaveBeenCalledWith(403);
    
    const jsonCallArgs = res.json.mock.calls[0][0];
    expect(jsonCallArgs.success).toBe(false);
    expect(jsonCallArgs.code).toBe('HTTP_403');
    expect(jsonCallArgs.message).toBe('Forbidden');
    expect(jsonCallArgs.correlationId).toBeDefined();
    
    expect(mockRecordException).toHaveBeenCalledWith(exception);
  });

  it('should handle domain errors with .code property', () => {
    const mockHost = createMockHost();
    const exception = new Error('Order not found');
    (exception as any).code = 'ORDER_NOT_FOUND';
    
    filter.catch(exception, mockHost);
    
    const res = mockHost.switchToHttp().getResponse() as any;
    expect(res.status).toHaveBeenCalledWith(404);
    
    const jsonCallArgs = res.json.mock.calls[0][0];
    expect(jsonCallArgs.success).toBe(false);
    expect(jsonCallArgs.code).toBe('ORDER_NOT_FOUND');
    expect(jsonCallArgs.message).toBe('Order not found');
  });

  it('should fallback to 500 for generic errors', () => {
    const mockHost = createMockHost();
    const exception = new Error('Database connection failed');
    
    filter.catch(exception, mockHost);
    
    const res = mockHost.switchToHttp().getResponse() as any;
    expect(res.status).toHaveBeenCalledWith(500);
    
    const jsonCallArgs = res.json.mock.calls[0][0];
    expect(jsonCallArgs.success).toBe(false);
    expect(jsonCallArgs.code).toBe('INTERNAL_ERROR');
    expect(jsonCallArgs.message).toBe('Database connection failed');
  });

  it('should use correlationId from headers if available', () => {
    const mockHost = createMockHost({ 'x-correlation-id': 'custom-uuid-123' });
    const exception = new Error('Any error');
    
    filter.catch(exception, mockHost);
    
    const res = mockHost.switchToHttp().getResponse() as any;
    const jsonCallArgs = res.json.mock.calls[0][0];
    expect(jsonCallArgs.correlationId).toBe('custom-uuid-123');
  });
});

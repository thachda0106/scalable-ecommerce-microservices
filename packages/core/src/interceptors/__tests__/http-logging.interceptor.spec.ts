import { HttpLoggingInterceptor } from '../http-logging.interceptor';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';

describe('HttpLoggingInterceptor', () => {
  let interceptor: HttpLoggingInterceptor;

  beforeEach(() => {
    const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any;
    interceptor = new HttpLoggingInterceptor(mockLogger);
  });

  const createMockContext = () => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          originalUrl: '/test',
          headers: { 'x-correlation-id': 'test-corr-id', 'user-agent': 'jest' },
          get: (name: string) => name === 'user-agent' ? 'jest' : undefined,
        }),
        getResponse: () => ({
          statusCode: 200,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should log on successful completion', (done) => {
    const mockContext = createMockContext();
    const callHandler: CallHandler = {
      handle: () => of('success response'),
    };

    const loggerSpy = jest.spyOn((interceptor as any).logger, 'log');

    interceptor.intercept(mockContext, callHandler).subscribe({
      next: (val) => {
        expect(val).toBe('success response');
      },
      complete: () => {
        expect(loggerSpy).toHaveBeenCalled();
        const logMsg = loggerSpy.mock.calls[0][0];
        expect(logMsg).toContain('[test-corr-id]');
        expect(logMsg).toContain('GET /test 200 - jest');
        done();
      },
    });
  });

  it('should log warning on error', (done) => {
    const mockContext = createMockContext();
    const callHandler: CallHandler = {
      handle: () => throwError(() => new Error('Test validation error')),
    };

    const loggerSpy = jest.spyOn((interceptor as any).logger, 'warn');

    interceptor.intercept(mockContext, callHandler).subscribe({
      error: (err) => {
        expect(err.message).toBe('Test validation error');
        expect(loggerSpy).toHaveBeenCalled();
        const logMsg = loggerSpy.mock.calls[0][0];
        expect(logMsg).toContain('[test-corr-id]');
        expect(logMsg).toContain('FAILED');
        done();
      },
    });
  });
});

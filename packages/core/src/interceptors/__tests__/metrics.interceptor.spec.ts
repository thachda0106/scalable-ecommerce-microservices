import { MetricsInterceptor } from '../metrics.interceptor';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';

describe('MetricsInterceptor', () => {
  let interceptor: MetricsInterceptor;

  beforeEach(() => {
    jest.clearAllMocks();
    interceptor = new MetricsInterceptor('test-service');
  });

  const createMockContext = () => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          route: { path: '/test/:id' },
          url: '/test/123'
        }),
        getResponse: () => ({
          statusCode: 201,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should observe metrics on successful completion', (done) => {
    const mockContext = createMockContext();
    const callHandler: CallHandler = {
      handle: () => of('created'),
    };

    const requestTotalMock = jest.spyOn((interceptor as any).requestCounter, 'inc');
    const durationMock = jest.spyOn((interceptor as any).durationHistogram, 'startTimer');

    interceptor.intercept(mockContext, callHandler).subscribe({
      complete: () => {
        try {
          expect(durationMock).toHaveBeenCalled();
          expect(requestTotalMock).toHaveBeenCalledTimes(1);
          expect(requestTotalMock).toHaveBeenCalledWith({
            service: 'test-service',
            method: 'POST',
            path: '/test/{id}',
            status: '201',
          });
          done();
        } catch (error) {
          done(error);
        }
      },
    });
  });

  it('should observe metrics on error', (done) => {
    const mockContext = createMockContext();
    const callHandler: CallHandler = {
      handle: () => throwError(() => ({ status: 400, name: 'BadRequestError' })),
    };

    const requestTotalMock = jest.spyOn((interceptor as any).requestCounter, 'inc');
    const requestErrorMock = jest.spyOn((interceptor as any).errorCounter, 'inc');

    interceptor.intercept(mockContext, callHandler).subscribe({
      error: () => {
        try {
          expect(requestTotalMock).toHaveBeenCalledTimes(1);
          expect(requestTotalMock).toHaveBeenCalledWith({
            service: 'test-service',
            method: 'POST',
            path: '/test/{id}',
            status: '400',
          });
          expect(requestErrorMock).toHaveBeenCalledTimes(1);
          expect(requestErrorMock).toHaveBeenCalledWith({
            service: 'test-service',
            method: 'POST',
            path: '/test/{id}',
            error_type: 'BadRequestError',
          });
          done();
        } catch (error) {
          done(error);
        }
      },
    });
  });
});


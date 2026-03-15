import { DomainExceptionFilter } from '../../filters/domain-exception.filter';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../domain/exceptions';
import {
  CartNotFoundException,
  ItemNotInCartException,
  CartFullException,
  VersionConflictException,
  ProductNotFoundException,
  InsufficientStockException,
} from '../../../domain/exceptions';

function mockArgumentsHost(responseObj: any) {
  return {
    switchToHttp: () => ({
      getResponse: () => responseObj,
      getRequest: () => ({}),
    }),
  } as any;
}

describe('DomainExceptionFilter', () => {
  let filter: DomainExceptionFilter;
  let mockResponse: any;

  beforeEach(() => {
    filter = new DomainExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  const testCases: Array<{
    name: string;
    exception: DomainException;
    expectedStatus: HttpStatus;
    expectedCode: string;
  }> = [
    {
      name: 'CartNotFoundException → 404',
      exception: new CartNotFoundException('user-1'),
      expectedStatus: HttpStatus.NOT_FOUND,
      expectedCode: 'CART_NOT_FOUND',
    },
    {
      name: 'ItemNotInCartException → 404',
      exception: new ItemNotInCartException('prod-1'),
      expectedStatus: HttpStatus.NOT_FOUND,
      expectedCode: 'ITEM_NOT_IN_CART',
    },
    {
      name: 'CartFullException → 422',
      exception: new CartFullException(50),
      expectedStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      expectedCode: 'CART_FULL',
    },
    {
      name: 'VersionConflictException → 409',
      exception: new VersionConflictException('user-1'),
      expectedStatus: HttpStatus.CONFLICT,
      expectedCode: 'VERSION_CONFLICT',
    },
    {
      name: 'ProductNotFoundException → 422',
      exception: new ProductNotFoundException('prod-1'),
      expectedStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      expectedCode: 'PRODUCT_NOT_FOUND',
    },
    {
      name: 'InsufficientStockException → 422',
      exception: new InsufficientStockException('prod-1'),
      expectedStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      expectedCode: 'INSUFFICIENT_STOCK',
    },
  ];

  testCases.forEach(({ name, exception, expectedStatus, expectedCode }) => {
    it(name, () => {
      const host = mockArgumentsHost(mockResponse);
      filter.catch(exception, host);

      expect(mockResponse.status).toHaveBeenCalledWith(expectedStatus);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: expectedStatus,
          error: expectedCode,
        }),
      );
    });
  });

  it('should return structured JSON response', () => {
    const host = mockArgumentsHost(mockResponse);
    const exc = new CartNotFoundException('user-1');
    filter.catch(exc, host);

    const jsonBody = mockResponse.json.mock.calls[0][0];
    expect(jsonBody).toHaveProperty('statusCode');
    expect(jsonBody).toHaveProperty('error');
    expect(jsonBody).toHaveProperty('message');
  });
});

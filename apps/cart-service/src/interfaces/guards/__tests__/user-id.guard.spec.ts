import { UserIdGuard } from '../../guards/user-id.guard';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

function mockExecutionContext(
  headers: Record<string, string | undefined>,
  params: Record<string, string>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers,
        params,
      }),
    }),
  } as any;
}

describe('UserIdGuard', () => {
  let guard: UserIdGuard;

  beforeEach(() => {
    guard = new UserIdGuard();
  });

  it('should allow request when x-user-id matches userId param', () => {
    const ctx = mockExecutionContext(
      { 'x-user-id': 'user-123' },
      { userId: 'user-123' },
    );

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw UnauthorizedException when x-user-id header is missing', () => {
    const ctx = mockExecutionContext({}, { userId: 'user-123' });

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw ForbiddenException when x-user-id does not match param', () => {
    const ctx = mockExecutionContext(
      { 'x-user-id': 'user-123' },
      { userId: 'user-456' },
    );

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should allow request when no userId param exists (e.g., health check)', () => {
    const ctx = mockExecutionContext(
      { 'x-user-id': 'user-123' },
      {},
    );

    expect(guard.canActivate(ctx)).toBe(true);
  });
});

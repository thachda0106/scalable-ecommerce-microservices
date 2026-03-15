import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenHandler } from '../refresh-token.handler';
import { RefreshTokenCommand } from '../../commands/refresh-token.command';
import { JwtAdapterService } from '../../../infrastructure/jwt/jwt-adapter.service';
import { TokenStoreService } from '../../../infrastructure/redis/token-store.service';
import { USER_REPOSITORY } from '../../../domain/ports/user-repository.port';
import { Role } from '../../../domain/value-objects/role.enum';
import { User } from '../../../domain/entities/user.entity';
import { Email } from '../../../domain/value-objects/email.value-object';

describe('RefreshTokenHandler', () => {
  let handler: RefreshTokenHandler;
  let jwtAdapter: { generateTokens: jest.Mock };
  let tokenStore: {
    getUserIdByRefreshToken: jest.Mock;
    revokeRefreshToken: jest.Mock;
    storeRefreshToken: jest.Mock;
    blocklistJti: jest.Mock;
  };
  let userRepository: { findById: jest.Mock };

  const mockUser = User.create({
    id: 'user-id-1',
    email: Email.create('test@example.com'),
    password: null,
    role: Role.CUSTOMER,
    isActive: true,
    isEmailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const mockNewTokens = { accessToken: 'new-at', refreshToken: 'new-rt', jti: 'new-jti' };

  beforeEach(async () => {
    jwtAdapter = { generateTokens: jest.fn().mockReturnValue(mockNewTokens) };
    tokenStore = {
      getUserIdByRefreshToken: jest.fn(),
      revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
      storeRefreshToken: jest.fn().mockResolvedValue(undefined),
      blocklistJti: jest.fn().mockResolvedValue(undefined),
    };
    userRepository = { findById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenHandler,
        { provide: JwtAdapterService, useValue: jwtAdapter },
        { provide: TokenStoreService, useValue: tokenStore },
        { provide: USER_REPOSITORY, useValue: userRepository },
      ],
    }).compile();

    handler = module.get<RefreshTokenHandler>(RefreshTokenHandler);
  });

  it('should rotate tokens on valid refresh token', async () => {
    tokenStore.getUserIdByRefreshToken.mockResolvedValue('user-id-1');
    userRepository.findById.mockResolvedValue(mockUser);

    const command = new RefreshTokenCommand({
      userId: 'user-id-1',
      refreshToken: 'old-rt',
      currentJti: 'old-jti',
    });
    const result = await handler.execute(command);

    expect(result).toEqual(mockNewTokens);
    // Old access token jti should be blocklisted
    expect(tokenStore.blocklistJti).toHaveBeenCalledWith('old-jti', 900);
    // Old refresh token revoked (namespaced)
    expect(tokenStore.revokeRefreshToken).toHaveBeenCalledWith('user-id-1', 'old-rt');
    // New refresh token stored (namespaced)
    expect(tokenStore.storeRefreshToken).toHaveBeenCalledWith('user-id-1', 'new-rt');
  });

  it('should throw UnauthorizedException for invalid/expired token', async () => {
    tokenStore.getUserIdByRefreshToken.mockResolvedValue(null);

    const command = new RefreshTokenCommand({
      userId: 'user-id-1',
      refreshToken: 'invalid-token',
      currentJti: 'old-jti',
    });
    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if user no longer active', async () => {
    tokenStore.getUserIdByRefreshToken.mockResolvedValue('user-id-1');
    const inactiveUser = User.create({
      ...mockUser['props'],
      id: 'user-id-1',
      email: Email.create('test@example.com'),
      password: null,
      role: Role.CUSTOMER,
      isActive: false,
      isEmailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    userRepository.findById.mockResolvedValue(inactiveUser);

    const command = new RefreshTokenCommand({
      userId: 'user-id-1',
      refreshToken: 'valid-rt',
      currentJti: 'old-jti',
    });
    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if user not found', async () => {
    tokenStore.getUserIdByRefreshToken.mockResolvedValue('user-id-1');
    userRepository.findById.mockResolvedValue(null);

    const command = new RefreshTokenCommand({
      userId: 'user-id-1',
      refreshToken: 'valid-rt',
      currentJti: 'old-jti',
    });
    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedException);
  });
});

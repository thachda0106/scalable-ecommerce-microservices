import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, HttpException } from '@nestjs/common';
import { LoginHandler } from '../login.handler';
import { LoginQuery } from '../../queries/login.query';
import { USER_REPOSITORY } from '../../../domain/ports/user-repository.port';
import { JwtAdapterService } from '../../../infrastructure/jwt/jwt-adapter.service';
import { TokenStoreService } from '../../../infrastructure/redis/token-store.service';
import { LoginAttemptService } from '../../services/auth.service';
import { KAFKA_SERVICE } from '../../../infrastructure/kafka/kafka-producer.module';
import { Logger } from '@ecommerce/core';
import * as argon2 from 'argon2';
import { Role } from '../../../domain/value-objects/role.enum';
import { User } from '../../../domain/entities/user.entity';
import { Email } from '../../../domain/value-objects/email.value-object';
import { Password } from '../../../domain/value-objects/password.value-object';

describe('LoginHandler', () => {
  let handler: LoginHandler;
  let userRepository: { findByEmail: jest.Mock };
  let jwtAdapter: { generateTokens: jest.Mock };
  let tokenStore: { storeRefreshToken: jest.Mock };
  let loginAttemptService: {
    isLocked: jest.Mock;
    recordFailedAttempt: jest.Mock;
    clearAttempts: jest.Mock;
  };
  let kafkaClient: { emit: jest.Mock };
  let logger: { error: jest.Mock };

  let mockUser: User;

  const mockTokens = { accessToken: 'at', refreshToken: 'rt', jti: 'test-jti' };

  beforeAll(async () => {
    const passwordHash = await argon2.hash('Password123!');
    mockUser = User.create({
      id: 'user-id-1',
      email: Email.create('test@example.com'),
      password: Password.create(passwordHash),
      role: Role.CUSTOMER,
      isActive: true,
      isEmailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  beforeEach(async () => {
    userRepository = { findByEmail: jest.fn() };
    jwtAdapter = { generateTokens: jest.fn().mockReturnValue(mockTokens) };
    tokenStore = { storeRefreshToken: jest.fn().mockResolvedValue(undefined) };
    loginAttemptService = {
      isLocked: jest.fn().mockResolvedValue(false),
      recordFailedAttempt: jest.fn().mockResolvedValue(undefined),
      clearAttempts: jest.fn().mockResolvedValue(undefined),
    };
    kafkaClient = { emit: jest.fn() };
    logger = { error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginHandler,
        { provide: USER_REPOSITORY, useValue: userRepository },
        { provide: JwtAdapterService, useValue: jwtAdapter },
        { provide: TokenStoreService, useValue: tokenStore },
        { provide: LoginAttemptService, useValue: loginAttemptService },
        { provide: KAFKA_SERVICE, useValue: kafkaClient },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        { provide: Logger, useValue: logger },
      ],
    }).compile();

    handler = module.get<LoginHandler>(LoginHandler);
  });

  it('should return tokens for valid credentials', async () => {
    userRepository.findByEmail.mockResolvedValue(mockUser);

    const result = await handler.execute(
      new LoginQuery({ email: 'test@example.com', password: 'Password123!' }),
    );

    expect(result).toEqual(mockTokens);
    expect(tokenStore.storeRefreshToken).toHaveBeenCalledWith('user-id-1', 'rt');
  });

  it('should clear login attempts on successful login', async () => {
    userRepository.findByEmail.mockResolvedValue(mockUser);

    await handler.execute(
      new LoginQuery({ email: 'test@example.com', password: 'Password123!' }),
    );

    expect(loginAttemptService.clearAttempts).toHaveBeenCalledWith('test@example.com');
  });

  it('should throw TooManyRequestsException when account is locked', async () => {
    loginAttemptService.isLocked.mockResolvedValue(true);

    await expect(
      handler.execute(
        new LoginQuery({ email: 'test@example.com', password: 'Password123!' }),
      ),
    ).rejects.toThrow(HttpException);

    // Should not even hit the DB
    expect(userRepository.findByEmail).not.toHaveBeenCalled();
  });

  it('should record failed attempt on wrong password', async () => {
    userRepository.findByEmail.mockResolvedValue(mockUser);

    await expect(
      handler.execute(
        new LoginQuery({ email: 'test@example.com', password: 'WrongPass!' }),
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(loginAttemptService.recordFailedAttempt).toHaveBeenCalledWith('test@example.com');
  });

  it('should throw UnauthorizedException for non-existent user', async () => {
    userRepository.findByEmail.mockResolvedValue(null);

    await expect(
      handler.execute(
        new LoginQuery({ email: 'nobody@example.com', password: 'Password123!' }),
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(loginAttemptService.recordFailedAttempt).toHaveBeenCalled();
  });

  it('should throw UnauthorizedException for inactive user', async () => {
    const inactiveUser = User.create({
      ...mockUser['props'],
      id: 'user-id-1',
      email: Email.create('test@example.com'),
      password: mockUser.password,
      role: Role.CUSTOMER,
      isActive: false,
      isEmailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    userRepository.findByEmail.mockResolvedValue(inactiveUser);

    await expect(
      handler.execute(
        new LoginQuery({ email: 'test@example.com', password: 'Password123!' }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should emit user.logged_in Kafka event on success', async () => {
    userRepository.findByEmail.mockResolvedValue(mockUser);

    await handler.execute(
      new LoginQuery({ email: 'test@example.com', password: 'Password123!' }),
    );

    expect(kafkaClient.emit).toHaveBeenCalledWith(
      'user.logged_in',
      expect.objectContaining({ userId: 'user-id-1' }),
    );
  });
});

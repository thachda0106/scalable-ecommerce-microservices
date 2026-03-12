import { Test, TestingModule } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { LoginHandler } from "../login.handler";
import { LoginQuery } from "../../queries/login.query";
import { getRepositoryToken } from "@nestjs/typeorm";
import { UserOrmEntity } from "../../../infrastructure/database/user.orm-entity";
import { JwtAdapterService } from "../../../infrastructure/jwt/jwt-adapter.service";
import { TokenStoreService } from "../../../infrastructure/redis/token-store.service";
import { KAFKA_SERVICE } from "../../../infrastructure/kafka/kafka-producer.module";
import { Logger } from "@ecommerce/core";
import * as argon2 from "argon2";
import { Role } from "../../../domain/value-objects/role.enum";

describe("LoginHandler", () => {
  let handler: LoginHandler;
  let userRepository: { findOne: jest.Mock };
  let jwtAdapter: { generateTokens: jest.Mock };
  let tokenStore: { storeRefreshToken: jest.Mock };
  let kafkaClient: { emit: jest.Mock };
  let logger: { error: jest.Mock };

  const mockUser: Partial<UserOrmEntity> = {
    id: "user-id-1",
    email: "test@example.com",
    passwordHash: "", // Will be set in beforeAll
    role: Role.CUSTOMER,
    isActive: true,
    isEmailVerified: false,
  };

  const mockTokens = { accessToken: "at", refreshToken: "rt" };

  beforeAll(async () => {
    // Hash a known password for tests
    mockUser.passwordHash = await argon2.hash("Password123!");
  });

  beforeEach(async () => {
    userRepository = { findOne: jest.fn() };
    jwtAdapter = { generateTokens: jest.fn().mockReturnValue(mockTokens) };
    tokenStore = { storeRefreshToken: jest.fn().mockResolvedValue(undefined) };
    kafkaClient = { emit: jest.fn() };
    logger = { error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginHandler,
        {
          provide: getRepositoryToken(UserOrmEntity),
          useValue: userRepository,
        },
        { provide: JwtAdapterService, useValue: jwtAdapter },
        { provide: TokenStoreService, useValue: tokenStore },
        { provide: KAFKA_SERVICE, useValue: kafkaClient },
        { provide: Logger, useValue: logger },
      ],
    }).compile();

    handler = module.get<LoginHandler>(LoginHandler);
  });

  it("should return tokens for valid credentials", async () => {
    userRepository.findOne.mockResolvedValue(mockUser);

    const query = new LoginQuery({
      email: "test@example.com",
      password: "Password123!",
    });
    const result = await handler.execute(query);

    expect(result).toEqual(mockTokens);
    expect(tokenStore.storeRefreshToken).toHaveBeenCalledWith(
      "rt",
      "user-id-1",
    );
  });

  it("should store refresh token in Redis on successful login", async () => {
    userRepository.findOne.mockResolvedValue(mockUser);

    const query = new LoginQuery({
      email: "test@example.com",
      password: "Password123!",
    });
    await handler.execute(query);

    expect(tokenStore.storeRefreshToken).toHaveBeenCalledWith(
      mockTokens.refreshToken,
      mockUser.id,
    );
  });

  it("should throw UnauthorizedException for wrong password", async () => {
    userRepository.findOne.mockResolvedValue(mockUser);

    const query = new LoginQuery({
      email: "test@example.com",
      password: "WrongPass!",
    });
    await expect(handler.execute(query)).rejects.toThrow(UnauthorizedException);
    expect(tokenStore.storeRefreshToken).not.toHaveBeenCalled();
  });

  it("should throw UnauthorizedException for non-existent user", async () => {
    userRepository.findOne.mockResolvedValue(null);

    const query = new LoginQuery({
      email: "nobody@example.com",
      password: "Password123!",
    });
    await expect(handler.execute(query)).rejects.toThrow(UnauthorizedException);
  });

  it("should throw UnauthorizedException for inactive user", async () => {
    userRepository.findOne.mockResolvedValue({ ...mockUser, isActive: false });

    const query = new LoginQuery({
      email: "test@example.com",
      password: "Password123!",
    });
    await expect(handler.execute(query)).rejects.toThrow(UnauthorizedException);
  });

  it("should emit user.logged_in Kafka event on success", async () => {
    userRepository.findOne.mockResolvedValue(mockUser);

    const query = new LoginQuery({
      email: "test@example.com",
      password: "Password123!",
    });
    await handler.execute(query);

    expect(kafkaClient.emit).toHaveBeenCalledWith(
      "identity",
      expect.objectContaining({ type: "user.logged_in" }),
    );
  });
});

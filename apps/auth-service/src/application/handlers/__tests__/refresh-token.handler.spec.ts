import { Test, TestingModule } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { RefreshTokenHandler } from "../refresh-token.handler";
import { RefreshTokenCommand } from "../../commands/refresh-token.command";
import { JwtAdapterService } from "../../../infrastructure/jwt/jwt-adapter.service";
import { TokenStoreService } from "../../../infrastructure/redis/token-store.service";
import { getRepositoryToken } from "@nestjs/typeorm";
import { UserOrmEntity } from "../../../infrastructure/database/user.orm-entity";
import { Role } from "../../../domain/value-objects/role.enum";

describe("RefreshTokenHandler", () => {
  let handler: RefreshTokenHandler;
  let jwtAdapter: { generateTokens: jest.Mock };
  let tokenStore: {
    getUserIdByRefreshToken: jest.Mock;
    revokeRefreshToken: jest.Mock;
    storeRefreshToken: jest.Mock;
  };
  let userRepository: { findOne: jest.Mock };

  const mockUser: Partial<UserOrmEntity> = {
    id: "user-id-1",
    email: "test@example.com",
    role: Role.CUSTOMER,
    isActive: true,
  };
  const mockNewTokens = { accessToken: "new-at", refreshToken: "new-rt" };

  beforeEach(async () => {
    jwtAdapter = { generateTokens: jest.fn().mockReturnValue(mockNewTokens) };
    tokenStore = {
      getUserIdByRefreshToken: jest.fn(),
      revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
      storeRefreshToken: jest.fn().mockResolvedValue(undefined),
    };
    userRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenHandler,
        { provide: JwtAdapterService, useValue: jwtAdapter },
        { provide: TokenStoreService, useValue: tokenStore },
        {
          provide: getRepositoryToken(UserOrmEntity),
          useValue: userRepository,
        },
      ],
    }).compile();

    handler = module.get<RefreshTokenHandler>(RefreshTokenHandler);
  });

  it("should rotate tokens on valid refresh token", async () => {
    tokenStore.getUserIdByRefreshToken.mockResolvedValue("user-id-1");
    userRepository.findOne.mockResolvedValue(mockUser);

    const command = new RefreshTokenCommand({ refreshToken: "old-rt" });
    const result = await handler.execute(command);

    expect(result).toEqual(mockNewTokens);
    // Old token revoked
    expect(tokenStore.revokeRefreshToken).toHaveBeenCalledWith("old-rt");
    // New token stored
    expect(tokenStore.storeRefreshToken).toHaveBeenCalledWith(
      "new-rt",
      "user-id-1",
    );
  });

  it("should throw UnauthorizedException for invalid/expired token", async () => {
    tokenStore.getUserIdByRefreshToken.mockResolvedValue(null);

    const command = new RefreshTokenCommand({ refreshToken: "invalid-token" });
    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("should throw UnauthorizedException if user no longer active", async () => {
    tokenStore.getUserIdByRefreshToken.mockResolvedValue("user-id-1");
    userRepository.findOne.mockResolvedValue({ ...mockUser, isActive: false });

    const command = new RefreshTokenCommand({ refreshToken: "valid-rt" });
    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("should throw UnauthorizedException if user not found", async () => {
    tokenStore.getUserIdByRefreshToken.mockResolvedValue("user-id-1");
    userRepository.findOne.mockResolvedValue(null);

    const command = new RefreshTokenCommand({ refreshToken: "valid-rt" });
    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

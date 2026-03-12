import { Controller, Get, Req, Res, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CommandBus } from "@nestjs/cqrs";
import { RegisterCommand } from "../../application/commands/register.command";
import { JwtAdapterService } from "../../infrastructure/jwt/jwt-adapter.service";
import { TokenStoreService } from "../../infrastructure/redis/token-store.service";
import { InjectRepository } from "@nestjs/typeorm";
import { UserOrmEntity } from "../../infrastructure/database/user.orm-entity";
import { Repository } from "typeorm";
import { Role } from "../../domain/value-objects/role.enum";

@Controller("auth")
export class OAuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly jwtAdapterService: JwtAdapterService,
    private readonly tokenStoreService: TokenStoreService,
    @InjectRepository(UserOrmEntity)
    private readonly userRepository: Repository<UserOrmEntity>,
  ) {}

  @Get("google")
  @UseGuards(AuthGuard("google"))
  async googleAuth(@Req() req) {
    // Initiates Google OAuth flow
  }

  @Get("google/callback")
  @UseGuards(AuthGuard("google"))
  async googleAuthRedirect(@Req() req, @Res() res) {
    return this.handleOAuthLogin(req.user, res);
  }

  @Get("github")
  @UseGuards(AuthGuard("github"))
  async githubAuth(@Req() req) {
    // Initiates Github OAuth flow
  }

  @Get("github/callback")
  @UseGuards(AuthGuard("github"))
  async githubAuthRedirect(@Req() req, @Res() res) {
    return this.handleOAuthLogin(req.user, res);
  }

  private async handleOAuthLogin(oauthUser: any, res: any) {
    // 1. Check if user already exists
    let user = await this.userRepository.findOne({
      where: { email: oauthUser.email },
    });

    // 2. Auto-register if user doesn't exist
    if (!user) {
      // In a real app we'd dispatch a full RegisterCommand, but since
      // RegisterCommand requires a password, we might need a separate
      // OAuthRegisterCommand or adapt RegisterCommand to make password optional.
      // For simplicity here, we'll create a random dummy password, or add them directly.
      const dummyPassword = Math.random().toString(36).slice(-8); // Random string
      await this.commandBus.execute(
        new RegisterCommand({
          email: oauthUser.email,
          password: dummyPassword, // They won't use this, but it satisfies the command
        }),
      );
      user = await this.userRepository.findOne({
        where: { email: oauthUser.email },
      });
    }

    // 3. Generate tokens
    const tokens = this.jwtAdapterService.generateTokens({
      id: user!.id,
      email: user!.email,
      role: user!.role as Role,
    });

    // 4. Store refresh token
    await this.tokenStoreService.storeRefreshToken(
      tokens.refreshToken,
      user!.id,
    );

    // 5. Return tokens (or set secure HttpOnly cookies and redirect)
    // We will just return JSON, but typically OAuth redirects to a frontend deep link.
    res.json(tokens);
  }
}

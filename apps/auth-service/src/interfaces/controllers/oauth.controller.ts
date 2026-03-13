import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CommandBus } from '@nestjs/cqrs';
import { OAuthLoginCommand } from '../../application/commands/oauth-login.command';
import type { Request, Response } from 'express';

interface OAuthUser {
  email: string;
  provider: string;
  providerId: string;
  firstName: string;
  lastName: string;
  picture?: string;
}

@Controller('auth')
export class OAuthController {
  constructor(private readonly commandBus: CommandBus) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Passport initiates the Google OAuth redirect — no body needed
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.handleOAuthCallback(req.user as OAuthUser, res);
  }

  @Get('github')
  @UseGuards(AuthGuard('github'))
  async githubAuth() {
    // Passport initiates the GitHub OAuth redirect
  }

  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  async githubAuthRedirect(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.handleOAuthCallback(req.user as OAuthUser, res);
  }

  private async handleOAuthCallback(
    oauthUser: OAuthUser,
    res: Response,
  ): Promise<void> {
    const tokens: unknown = await this.commandBus.execute(
      new OAuthLoginCommand({
        email: oauthUser.email,
        provider: oauthUser.provider,
        providerId: oauthUser.providerId,
        firstName: oauthUser.firstName,
        lastName: oauthUser.lastName,
        picture: oauthUser.picture,
      }),
    );
    res.json(tokens);
  }
}

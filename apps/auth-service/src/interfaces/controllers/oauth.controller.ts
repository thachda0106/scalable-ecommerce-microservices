import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CommandBus } from '@nestjs/cqrs';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { OAuthLoginCommand } from '../../application/commands/oauth-login.command';
import type { Request, Response } from 'express';
import type { AuthTokens } from '../../infrastructure/jwt/jwt-adapter.service';

interface OAuthUser {
  email: string;
  provider: string;
  providerId: string;
  firstName: string;
  lastName: string;
  picture?: string | null;
}

/** Duration for the HttpOnly refresh-token cookie (7 days in ms) */
const REFRESH_TOKEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

@ApiTags('Auth')
@Controller('auth')
export class OAuthController {
  constructor(private readonly commandBus: CommandBus) {}

  @ApiOperation({ summary: '🔓 Initiate Google OAuth flow' })
  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Passport initiates the Google OAuth redirect — no body needed
  }

  @ApiOperation({ summary: '🔓 Google OAuth callback' })
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.handleOAuthCallback(req.user as OAuthUser, res);
  }

  @ApiOperation({ summary: '🔓 Initiate GitHub OAuth flow' })
  @Get('github')
  @UseGuards(AuthGuard('github'))
  async githubAuth() {
    // Passport initiates the GitHub OAuth redirect
  }

  @ApiOperation({ summary: '🔓 GitHub OAuth callback' })
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
    const tokens = (await this.commandBus.execute(
      new OAuthLoginCommand({
        email: oauthUser.email,
        provider: oauthUser.provider,
        providerId: oauthUser.providerId,
        firstName: oauthUser.firstName,
        lastName: oauthUser.lastName,
        picture: oauthUser.picture ?? undefined,
      }),
    )) as AuthTokens;

    // SEC: Set refresh token in HttpOnly cookie — not accessible to JavaScript
    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE,
    });

    // Return only the access token and jti in the JSON body
    res.json({
      accessToken: tokens.accessToken,
      jti: tokens.jti,
    });
  }
}

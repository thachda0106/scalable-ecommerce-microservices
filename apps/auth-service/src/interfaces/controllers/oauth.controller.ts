import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CommandBus } from '@nestjs/cqrs';
import { OAuthLoginCommand } from '../../application/commands/oauth-login.command';

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
  async googleAuthRedirect(@Req() req, @Res() res) {
    await this.handleOAuthCallback(req.user, res);
  }

  @Get('github')
  @UseGuards(AuthGuard('github'))
  async githubAuth() {
    // Passport initiates the GitHub OAuth redirect
  }

  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  async githubAuthRedirect(@Req() req, @Res() res) {
    await this.handleOAuthCallback(req.user, res);
  }

  private async handleOAuthCallback(oauthUser: any, res: any): Promise<void> {
    const tokens = await this.commandBus.execute(
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

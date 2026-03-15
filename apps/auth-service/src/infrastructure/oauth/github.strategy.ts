import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';

interface GithubProfile {
  id: string;
  username: string;
  displayName: string;
  emails?: Array<{ value: string; primary?: boolean; verified?: boolean }>;
  photos?: Array<{ value: string }>;
}

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor() {
    const clientID = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientID || !clientSecret) {
      throw new Error(
        'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables are required',
      );
    }

    super({
      clientID,
      clientSecret,
      callbackURL:
        process.env.GITHUB_CALLBACK_URL ||
        'http://localhost:3000/auth/github/callback',
      scope: ['user:email'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: GithubProfile,
    done: (err: Error | null, user?: Record<string, unknown>) => void,
  ): void {
    const { id, username, displayName, emails, photos } = profile;

    // Prefer a primary + verified email from GitHub
    const verifiedEmail = emails?.find(
      (e) => e.primary === true && e.verified === true,
    ) ?? emails?.find((e) => e.verified === true);

    if (!verifiedEmail) {
      // Never synthesize {username}@github.com — reject instead
      done(
        new UnauthorizedException(
          'GitHub account does not have a verified email. ' +
            'Please verify your email on GitHub or make it public.',
        ),
      );
      return;
    }

    const nameParts = displayName?.split(' ') ?? [];
    const user = {
      provider: 'github',
      providerId: id,
      email: verifiedEmail.value,
      firstName: nameParts[0] || username,
      lastName: nameParts.slice(1).join(' ') || '',
      picture: photos?.[0]?.value ?? null,
      // accessToken intentionally omitted — not needed by auth-service
    };
    done(null, user);
  }
}

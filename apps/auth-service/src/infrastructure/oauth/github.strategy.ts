import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor() {
    super({
      clientID: process.env.GITHUB_CLIENT_ID || 'mock-github-client-id',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || 'mock-github-secret',
      callbackURL:
        process.env.GITHUB_CALLBACK_URL ||
        'http://localhost:3000/auth/github/callback',
      scope: ['user:email'],
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Record<string, any>,
    done: (err: Error | null, user?: any) => void,
  ): void {
    const { id, username, displayName, emails, photos } = profile;
    const user = {
      provider: 'github',
      providerId: id,
      email: emails ? emails[0].value : `${username}@github.com`,
      firstName: displayName?.split(' ')[0] || username,
      lastName: displayName?.split(' ').slice(1).join(' ') || '',
      picture: photos ? photos[0].value : null,
      accessToken,
    };
    done(null, user);
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';

interface GoogleProfile {
  id: string;
  name: { givenName: string; familyName: string };
  emails: Array<{ value: string; verified?: boolean }>;
  photos: Array<{ value: string }>;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientID || !clientSecret) {
      throw new Error(
        'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required',
      );
    }

    super({
      clientID,
      clientSecret,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        'http://localhost:3000/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: GoogleProfile,
    done: VerifyCallback,
  ): void {
    const { id, name, emails, photos } = profile;

    // Only accept verified emails from Google
    const verifiedEmail = emails.find((e) => e.verified !== false);
    if (!verifiedEmail) {
      done(
        new UnauthorizedException(
          'Google account does not have a verified email',
        ),
      );
      return;
    }

    const user = {
      provider: 'google',
      providerId: id,
      email: verifiedEmail.value,
      firstName: name.givenName,
      lastName: name.familyName,
      picture: photos[0]?.value ?? null,
      // accessToken intentionally omitted — not needed by auth-service
    };
    done(null, user);
  }
}

import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const jwtSecret = configService.get<string>('gateway.jwt.secret');
    if (!jwtSecret) {
      throw new Error(
        'JWT_SECRET environment variable is required but not set',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async validate(payload: { sub: string; email: string; roles: string[] }) {
    if (!payload.sub) {
      throw new UnauthorizedException();
    }
    return { userId: payload.sub, email: payload.email, roles: payload.roles };
  }
}

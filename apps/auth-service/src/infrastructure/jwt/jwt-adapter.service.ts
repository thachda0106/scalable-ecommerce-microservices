import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../../domain/value-objects/role.enum';
import * as crypto from 'crypto';

export interface TokenPayload {
  sub: string;
  email: string;
  role: Role;
  jti: string;
  tenantId?: string | null;
  orgId?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  /** Opaque high-entropy random string stored in Redis */
  refreshToken: string;
  /** JWT ID — pass back on logout to blocklist the access token */
  jti: string;
}

@Injectable()
export class JwtAdapterService {
  constructor(private readonly jwtService: JwtService) {}

  generateTokens(userPayload: {
    id: string;
    email: string;
    role: Role;
    tenantId?: string | null;
    orgId?: string | null;
  }): AuthTokens {
    // Unique ID per access token — enables pre-expiry revocation via blocklist
    const jti = crypto.randomUUID();

    const payload: TokenPayload = {
      sub: userPayload.id,
      email: userPayload.email,
      role: userPayload.role,
      jti,
      tenantId: userPayload.tenantId,
      orgId: userPayload.orgId,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
    });

    // Refresh token is an opaque high-entropy string — NOT a JWT
    const refreshToken = crypto.randomBytes(40).toString('hex');

    return { accessToken, refreshToken, jti };
  }
}

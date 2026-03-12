import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { User } from "../../domain/entities/user.entity";
import { Role } from "../../domain/value-objects/role.enum";
import * as crypto from "crypto";

export interface TokenPayload {
  sub: string;
  email: string;
  role: Role;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class JwtAdapterService {
  constructor(private readonly jwtService: JwtService) {}

  generateTokens(userPayload: {
    id: string;
    email: string;
    role: Role;
  }): AuthTokens {
    const payload: TokenPayload = {
      sub: userPayload.id,
      email: userPayload.email,
      role: userPayload.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: "15m",
    });

    // Refresh token is an opaque high-entropy string
    const refreshToken = crypto.randomBytes(40).toString("hex");

    return {
      accessToken,
      refreshToken,
    };
  }
}

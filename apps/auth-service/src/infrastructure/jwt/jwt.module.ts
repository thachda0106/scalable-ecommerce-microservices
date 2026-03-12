import { Module, Global } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { JwtAdapterService } from "./jwt-adapter.service";

// Fail fast at import time — no runtime surprises on first token generation
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("JWT_SECRET environment variable is required");
}

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    // expiresIn is controlled per-token in JwtAdapterService.generateTokens()
    JwtModule.register({ secret: jwtSecret }),
  ],
  providers: [JwtAdapterService],
  exports: [JwtAdapterService, JwtModule, PassportModule],
})
export class AuthJwtModule {}

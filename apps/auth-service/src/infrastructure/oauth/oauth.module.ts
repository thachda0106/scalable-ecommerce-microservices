import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { GoogleStrategy } from "./google.strategy";
import { GithubStrategy } from "./github.strategy";

@Module({
  imports: [PassportModule],
  providers: [GoogleStrategy, GithubStrategy],
  exports: [GoogleStrategy, GithubStrategy],
})
export class OAuthModule {}

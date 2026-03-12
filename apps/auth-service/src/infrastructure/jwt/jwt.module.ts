import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtAdapterService } from './jwt-adapter.service';

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'fallback_development_secret',
        signOptions: { expiresIn: '15m' }, // Default sign options for access token
      }),
    }),
  ],
  providers: [JwtAdapterService],
  exports: [JwtAdapterService, JwtModule, PassportModule],
})
export class AuthJwtModule {}

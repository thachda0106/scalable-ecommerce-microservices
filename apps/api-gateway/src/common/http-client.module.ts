import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BaseHttpClient } from './http-client';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        timeout: config.get<number>('gateway.timeout', 5000),
        maxRedirects: 5,
      }),
    }),
  ],
  providers: [BaseHttpClient],
  exports: [BaseHttpClient, HttpModule],
})
export class HttpClientModule {}

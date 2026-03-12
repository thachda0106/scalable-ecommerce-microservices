import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { BaseHttpClient } from "./http-client";

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
  ],
  providers: [BaseHttpClient],
  exports: [BaseHttpClient, HttpModule],
})
export class HttpClientModule {}

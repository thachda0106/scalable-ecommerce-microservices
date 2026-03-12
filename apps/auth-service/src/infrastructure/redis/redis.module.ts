import { Module, Global } from "@nestjs/common";
import { Redis } from "ioredis";
import { TokenStoreService } from "./token-store.service";

export const REDIS_CLIENT = "REDIS_CLIENT";

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        return new Redis({
          host: process.env.REDIS_HOST || "localhost",
          port: parseInt(process.env.REDIS_PORT || "6379", 10),
        });
      },
    },
    TokenStoreService,
  ],
  exports: [REDIS_CLIENT, TokenStoreService],
})
export class RedisModule {}

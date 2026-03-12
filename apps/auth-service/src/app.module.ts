import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CqrsModule } from "@nestjs/cqrs";
import { AuthController } from "./interfaces/controllers/auth.controller";
import { AuthService } from "./application/services/auth.service";
import { getLoggerModule } from "@ecommerce/core";
import { DatabaseModule } from "./infrastructure/database/database.module";
import { RedisModule } from "./infrastructure/redis/redis.module";
import { KafkaProducerModule } from "./infrastructure/kafka/kafka-producer.module";
import { AuthJwtModule } from "./infrastructure/jwt/jwt.module";
import { RegisterHandler } from "./application/handlers/register.handler";
import { LoginHandler } from "./application/handlers/login.handler";
import { RefreshTokenHandler } from "./application/handlers/refresh-token.handler";
import { ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "nestjs-throttler-storage-redis";
import Redis from "ioredis";
import { OAuthModule } from "./infrastructure/oauth/oauth.module";
import { OAuthController } from "./interfaces/controllers/oauth.controller";

const CommandHandlers = [RegisterHandler, RefreshTokenHandler];
const QueryHandlers = [LoginHandler];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CqrsModule,
    getLoggerModule(),
    DatabaseModule,
    RedisModule,
    KafkaProducerModule,
    AuthJwtModule,
    OAuthModule,
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        // Login and Auth generic throttling: max 10 requests per 1 minute
        throttlers: [{ ttl: 60000, limit: 10 }],
        storage: new ThrottlerStorageRedisService(
          new Redis({
            host: process.env.REDIS_HOST || "localhost",
            port: parseInt(process.env.REDIS_PORT || "6379", 10),
          }),
        ),
      }),
    }),
  ],
  controllers: [AuthController, OAuthController],
  providers: [AuthService, ...CommandHandlers, ...QueryHandlers],
})
export class AppModule {}

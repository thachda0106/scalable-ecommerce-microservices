import { Module } from "@nestjs/common";
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

const CommandHandlers = [RegisterHandler, RefreshTokenHandler];
const QueryHandlers = [LoginHandler];

@Module({
  imports: [
    CqrsModule,
    getLoggerModule(),
    DatabaseModule,
    RedisModule,
    KafkaProducerModule,
    AuthJwtModule,
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
  controllers: [AuthController],
  providers: [AuthService, ...CommandHandlers, ...QueryHandlers],
})
export class AppModule {}

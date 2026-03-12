import { Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { HttpModule } from "@nestjs/axios";
import { ThrottlerStorageRedisService } from "nestjs-throttler-storage-redis";
import { getLoggerModule } from "@ecommerce/core";
import { GatewayConfig } from "./config/gateway.config";
import { ServicesConfig } from "./config/services.config";
import { ProxyModule } from "./modules/proxy/proxy.module";
import { AggregationModule } from "./modules/aggregation/aggregation.module";
import { JwtStrategy } from "./common/guards/jwt.strategy";
import { RequestIdMiddleware } from "./middleware/request-id.middleware";
import { BaseHttpClient } from "./common/http-client";
import { GatewayController } from "./controllers/gateway.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [GatewayConfig, ServicesConfig],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ ttl: 60000, limit: 100 }],
        storage: new ThrottlerStorageRedisService(
          `redis://${config.get<string>(
            "redis.host",
            "localhost",
          )}:${config.get<number>("redis.port", 6379)}`,
        ),
      }),
    }),
    HttpModule,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    getLoggerModule(),
    ProxyModule,
    AggregationModule,
  ],
  controllers: [GatewayController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    JwtStrategy,
    BaseHttpClient,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}

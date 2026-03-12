import { Module } from "@nestjs/common";
import { AuthController } from "./interfaces/controllers/auth.controller";
import { AuthService } from "./application/services/auth.service";
import { getLoggerModule } from "@ecommerce/core";
import { DatabaseModule } from "./infrastructure/database/database.module";
import { RedisModule } from "./infrastructure/redis/redis.module";
import { KafkaProducerModule } from "./infrastructure/kafka/kafka-producer.module";

@Module({
  imports: [
    getLoggerModule(),
    DatabaseModule,
    RedisModule,
    KafkaProducerModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AppModule {}

import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { AuthController } from "./interfaces/controllers/auth.controller";
import { AuthService } from "./application/services/auth.service";
import { getLoggerModule } from "@ecommerce/core";
import { DatabaseModule } from "./infrastructure/database/database.module";
import { RedisModule } from "./infrastructure/redis/redis.module";
import { KafkaProducerModule } from "./infrastructure/kafka/kafka-producer.module";
import { RegisterHandler } from "./application/handlers/register.handler";
import { LoginHandler } from "./application/handlers/login.handler";

const CommandHandlers = [RegisterHandler];
const QueryHandlers = [LoginHandler];

@Module({
  imports: [
    CqrsModule,
    getLoggerModule(),
    DatabaseModule,
    RedisModule,
    KafkaProducerModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, ...CommandHandlers, ...QueryHandlers],
})
export class AppModule {}

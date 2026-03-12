import { Module } from "@nestjs/common";
import { AuthController } from "./interfaces/controllers/auth.controller";
import { AuthService } from "./application/services/auth.service";
import { getLoggerModule } from "@ecommerce/core";
import { DatabaseModule } from "./infrastructure/database/database.module";

@Module({
  imports: [getLoggerModule(), DatabaseModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AppModule {}

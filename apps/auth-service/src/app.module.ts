import { Module } from "@nestjs/common";
import { AuthController } from "./interfaces/controllers/auth.controller";
import { AuthService } from "./application/services/auth.service";
import { getLoggerModule } from "@ecommerce/core";

@Module({
  imports: [getLoggerModule()],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AppModule {}

import { Controller, Get } from "@nestjs/common";
import { AuthService } from "../../application/services/auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("/health")
  healthCheck(): string {
    return "OK";
  }

  @Get()
  getHello(): string {
    return this.authService.getHello();
  }
}

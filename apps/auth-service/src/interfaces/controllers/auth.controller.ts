import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { RegisterDto, LoginDto } from "../dto/auth.dto";
import { RegisterCommand } from "../../application/commands/register.command";
import { LoginQuery } from "../../application/queries/login.query";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post("register")
  async register(@Body() registerDto: RegisterDto) {
    return this.commandBus.execute(new RegisterCommand(registerDto));
  }

  @HttpCode(HttpStatus.OK)
  @Post("login")
  async login(@Body() loginDto: LoginDto) {
    return this.queryBus.execute(new LoginQuery(loginDto));
  }
}

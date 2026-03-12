import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { RegisterDto, LoginDto } from '../dto/auth.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { LogoutDto } from '../dto/logout.dto';
import { RegisterCommand } from '../../application/commands/register.command';
import { LogoutCommand } from '../../application/commands/logout.command';
import { LoginQuery } from '../../application/queries/login.query';
import { RefreshTokenCommand } from '../../application/commands/refresh-token.command';
import { ThrottlerGuard } from '@nestjs/throttler';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.commandBus.execute(new RegisterCommand(registerDto));
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.queryBus.execute(new LoginQuery(loginDto));
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.commandBus.execute(new RefreshTokenCommand(refreshTokenDto));
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Body() logoutDto: LogoutDto) {
    return this.commandBus.execute(new LogoutCommand(logoutDto.refreshToken));
  }
}

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { RegisterDto, LoginDto } from '../dto/auth.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { LogoutDto } from '../dto/logout.dto';
import { RegisterCommand } from '../../application/commands/register.command';
import { LogoutCommand } from '../../application/commands/logout.command';
import { LoginQuery } from '../../application/queries/login.query';
import { RefreshTokenCommand } from '../../application/commands/refresh-token.command';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user?: { sub: string; jti?: string };
}

@ApiTags('Auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @ApiOperation({ summary: '🔓 Register a new user account' })
  @ApiResponse({ status: 201, description: 'User registered' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  @Post('register')
  async register(@Body() registerDto: RegisterDto): Promise<unknown> {
    return this.commandBus.execute(new RegisterCommand(registerDto));
  }

  @ApiOperation({ summary: '🔓 Login with email and password' })
  @ApiResponse({ status: 200, description: 'Returns accessToken, refreshToken, jti' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Account locked — too many failed attempts' })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() loginDto: LoginDto): Promise<unknown> {
    return this.queryBus.execute(new LoginQuery(loginDto));
  }

  @ApiOperation({ summary: '🔓 Rotate refresh token and issue new access token' })
  @ApiResponse({ status: 200, description: 'Returns new accessToken, refreshToken, jti' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() refreshTokenDto: RefreshTokenDto): Promise<unknown> {
    return this.commandBus.execute(new RefreshTokenCommand(refreshTokenDto));
  }

  @ApiOperation({ summary: 'Logout — revoke refresh token and blocklist access token jti' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Logged out' })
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @Body() logoutDto: LogoutDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    // Extract userId and jti from the authenticated request when available
    const userId = logoutDto.userId ?? req.user?.sub ?? '';
    const jti = logoutDto.jti ?? req.user?.jti;

    return this.commandBus.execute(
      new LogoutCommand(logoutDto.refreshToken, userId, jti),
    );
  }
}

import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query,
  UsePipes, ValidationPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { CreateUserDto, UpdateUserDto, UpdateUserProfileDto, UpdateUserSettingsDto, SuspendUserDto, GetUsersQueryDto } from '../dto';
import { CreateUserHandler } from '../../application/handlers/create-user.handler';
import { UpdateUserHandler } from '../../application/handlers/update-user.handler';
import { DeleteUserHandler } from '../../application/handlers/delete-user.handler';
import { UpdateUserProfileHandler } from '../../application/handlers/update-user-profile.handler';
import { UpdateUserSettingsHandler } from '../../application/handlers/update-user-settings.handler';
import { SuspendUserHandler } from '../../application/handlers/suspend-user.handler';
import { ReactivateUserHandler } from '../../application/handlers/reactivate-user.handler';
import { GetUserByIdHandler } from '../../application/handlers/get-user-by-id.handler';
import { GetUsersHandler } from '../../application/handlers/get-users.handler';
import { CreateUserCommand } from '../../application/commands/create-user.command';
import { UpdateUserCommand } from '../../application/commands/update-user.command';
import { DeleteUserCommand } from '../../application/commands/delete-user.command';
import { UpdateUserProfileCommand } from '../../application/commands/update-user-profile.command';
import { UpdateUserSettingsCommand } from '../../application/commands/update-user-settings.command';
import { SuspendUserCommand } from '../../application/commands/suspend-user.command';
import { ReactivateUserCommand } from '../../application/commands/reactivate-user.command';
import { GetUserByIdQuery } from '../../application/queries/get-user-by-id.query';
import { GetUsersQuery } from '../../application/queries/get-users.query';

@Controller('users')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class UserController {
  constructor(
    private readonly createUserHandler: CreateUserHandler,
    private readonly updateUserHandler: UpdateUserHandler,
    private readonly deleteUserHandler: DeleteUserHandler,
    private readonly updateUserProfileHandler: UpdateUserProfileHandler,
    private readonly updateUserSettingsHandler: UpdateUserSettingsHandler,
    private readonly suspendUserHandler: SuspendUserHandler,
    private readonly reactivateUserHandler: ReactivateUserHandler,
    private readonly getUserByIdHandler: GetUserByIdHandler,
    private readonly getUsersHandler: GetUsersHandler,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createUser(@Body() dto: CreateUserDto) {
    const userId = await this.createUserHandler.execute(
      new CreateUserCommand(dto.email, dto.username),
    );
    return { id: userId };
  }

  @Get()
  async getUsers(@Query() query: GetUsersQueryDto) {
    return this.getUsersHandler.execute(
      new GetUsersQuery(query.page, query.limit, query.status),
    );
  }

  @Get(':id')
  async getUserById(@Param('id') id: string) {
    return this.getUserByIdHandler.execute(new GetUserByIdQuery(id));
  }

  @Patch(':id')
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    await this.updateUserHandler.execute(
      new UpdateUserCommand(id, dto.email, dto.username),
    );
    return { message: 'User updated' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(@Param('id') id: string) {
    await this.deleteUserHandler.execute(new DeleteUserCommand(id));
  }

  @Patch(':id/profile')
  async updateProfile(@Param('id') id: string, @Body() dto: UpdateUserProfileDto) {
    await this.updateUserProfileHandler.execute(
      new UpdateUserProfileCommand(
        id,
        dto.displayName,
        dto.avatar,
        dto.bio,
        dto.phoneNumber,
        dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      ),
    );
    return { message: 'Profile updated' };
  }

  @Patch(':id/settings')
  async updateSettings(@Param('id') id: string, @Body() dto: UpdateUserSettingsDto) {
    await this.updateUserSettingsHandler.execute(
      new UpdateUserSettingsCommand(
        id,
        dto.emailNotifications,
        dto.pushNotifications,
        dto.smsNotifications,
        dto.language,
        dto.timezone,
      ),
    );
    return { message: 'Settings updated' };
  }

  @Post(':id/suspend')
  async suspendUser(@Param('id') id: string, @Body() dto: SuspendUserDto) {
    await this.suspendUserHandler.execute(new SuspendUserCommand(id, dto.reason));
    return { message: 'User suspended' };
  }

  @Post(':id/reactivate')
  async reactivateUser(@Param('id') id: string) {
    await this.reactivateUserHandler.execute(new ReactivateUserCommand(id));
    return { message: 'User reactivated' };
  }
}

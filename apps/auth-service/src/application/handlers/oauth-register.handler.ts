import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { OAuthRegisterCommand } from '../commands/oauth-register.command';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../domain/ports/user-repository.port';
import { Inject } from '@nestjs/common';
import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email.value-object';
import { Role } from '../../domain/value-objects/role.enum';
import { UnitOfWork, Logger } from '@ecommerce/core';
import { randomUUID } from 'crypto';
import { AuthEvent } from '../../domain/events/auth-event';

@CommandHandler(OAuthRegisterCommand)
export class OAuthRegisterHandler implements ICommandHandler<OAuthRegisterCommand> {

  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepositoryPort,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(
    command: OAuthRegisterCommand,
  ): Promise<{ id: string; email: string }> {
    const { email, provider, providerId, firstName, lastName, picture } =
      command.dto;

    const now = new Date();
    const user = User.create({
      id: randomUUID(),
      email: Email.create(email),
      password: null,
      role: Role.CUSTOMER,
      isEmailVerified: true,
      isActive: true,
      provider,
      providerId,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      picture: picture ?? null,
      createdAt: now,
      updatedAt: now,
    });

    const event = new AuthEvent('user.registered', {
      userId: user.id,
      email: user.email.getValue(),
      provider,
      providerId,
      timestamp: new Date().toISOString(),
    });

    const savedUser = await this.unitOfWork.execute(
      () => this.userRepository.save(user),
      [event],
    );

    return { id: savedUser.id, email: savedUser.email.getValue() };
  }
}

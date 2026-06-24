import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RegisterCommand } from '../commands/register.command';
import * as argon2 from 'argon2';
import { ConflictException, Inject } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../domain/ports/user-repository.port';
import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email.value-object';
import { Password } from '../../domain/value-objects/password.value-object';
import { Role } from '../../domain/value-objects/role.enum';
import { UnitOfWork, Logger } from '@ecommerce/core';
import { randomUUID } from 'crypto';
import { AuthEvent } from '../../domain/events/auth-event';

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand> {

  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepositoryPort,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(
    command: RegisterCommand,
  ): Promise<{ id: string; email: string }> {
    const { email, password } = command.dto;

    const emailVO = Email.create(email);

    const existingUser = await this.userRepository.findByEmail(
      emailVO.getValue(),
    );
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await argon2.hash(password);
    const passwordVO = Password.create(passwordHash);

    const now = new Date();
    const user = User.create({
      id: randomUUID(),
      email: emailVO,
      password: passwordVO,
      role: Role.CUSTOMER,
      isEmailVerified: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const event = new AuthEvent('user.registered', {
      userId: user.id,
      email: user.email.getValue(),
      timestamp: new Date().toISOString(),
    });

    const savedUser = await this.unitOfWork.execute(
      () => this.userRepository.save(user),
      [event],
    );

    return {
      id: savedUser.id,
      email: savedUser.email.getValue(),
    };
  }
}

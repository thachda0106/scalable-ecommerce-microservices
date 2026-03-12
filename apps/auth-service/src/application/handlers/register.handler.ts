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
import { KAFKA_SERVICE } from '../../infrastructure/kafka/kafka-producer.module';
import { ClientKafka } from '@nestjs/microservices';
import { Logger } from '@ecommerce/core';

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand> {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepositoryPort,
    @Inject(KAFKA_SERVICE)
    private readonly kafkaClient: ClientKafka,
    private readonly logger: Logger,
  ) {}

  async execute(
    command: RegisterCommand,
  ): Promise<{ id: string; email: string }> {
    const { email, password } = command.dto;

    // Domain validation via value objects
    const emailVO = Email.create(email);

    // Check if user exists
    const existingUser = await this.userRepository.findByEmail(
      emailVO.getValue(),
    );
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Hash password with Argon2
    const passwordHash = await argon2.hash(password);
    const passwordVO = Password.create(passwordHash);

    // Create domain entity
    const now = new Date();
    const user = User.create({
      id: crypto.randomUUID(),
      email: emailVO,
      password: passwordVO,
      role: Role.CUSTOMER,
      isEmailVerified: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    // Persist via repository (domain → ORM mapping is inside UserRepository)
    const savedUser = await this.userRepository.save(user);

    // Fire & Forget: Emit integration event
    try {
      this.kafkaClient.emit('identity', {
        type: 'user.registered',
        data: {
          userId: savedUser.id,
          email: savedUser.email.getValue(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      this.logger.error('Failed to emit user.registered event', err);
    }

    return {
      id: savedUser.id,
      email: savedUser.email.getValue(),
    };
  }
}

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
import { KAFKA_SERVICE } from '../../infrastructure/kafka/kafka-producer.module';
import { ClientKafka } from '@nestjs/microservices';
import { Logger } from '@ecommerce/core';

@CommandHandler(OAuthRegisterCommand)
export class OAuthRegisterHandler
  implements ICommandHandler<OAuthRegisterCommand>
{
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepositoryPort,
    @Inject(KAFKA_SERVICE)
    private readonly kafkaClient: ClientKafka,
    private readonly logger: Logger,
  ) {}

  async execute(
    command: OAuthRegisterCommand,
  ): Promise<{ id: string; email: string }> {
    const { email, provider, providerId, firstName, lastName, picture } =
      command.dto;

    // Build domain entity with OAuth identity — no dummy password
    const now = new Date();
    const user = User.create({
      id: crypto.randomUUID(),
      email: Email.create(email),
      password: null, // OAuth-only users have no local password
      role: Role.CUSTOMER,
      isEmailVerified: true, // OAuth provider has verified the email
      isActive: true,
      provider,
      providerId,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      picture: picture ?? null,
      createdAt: now,
      updatedAt: now,
    });

    // Persist via domain port (ORM mapping in UserRepository)
    const savedUser = await this.userRepository.save(user);

    // Emit user.registered event to dedicated topic
    try {
      this.kafkaClient.emit('user.registered', {
        userId: savedUser.id,
        email: savedUser.email.getValue(),
        provider,
        providerId,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      this.logger.error(
        'Failed to emit user.registered event (OAuth)',
        err instanceof Error ? err.message : String(err),
      );
    }

    return { id: savedUser.id, email: savedUser.email.getValue() };
  }
}

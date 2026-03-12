import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { OAuthRegisterCommand } from "../commands/oauth-register.command";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserOrmEntity } from "../../infrastructure/database/user.orm-entity";
import { Role } from "../../domain/value-objects/role.enum";
import { Logger } from "@ecommerce/core";
import { KAFKA_SERVICE } from "../../infrastructure/kafka/kafka-producer.module";
import { Inject } from "@nestjs/common";
import { ClientKafka } from "@nestjs/microservices";

@CommandHandler(OAuthRegisterCommand)
export class OAuthRegisterHandler
  implements ICommandHandler<OAuthRegisterCommand> {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly userRepository: Repository<UserOrmEntity>,
    @Inject(KAFKA_SERVICE)
    private readonly kafkaClient: ClientKafka,
    private readonly logger: Logger,
  ) {}

  async execute(
    command: OAuthRegisterCommand,
  ): Promise<{ id: string; email: string }> {
    const {
      email,
      provider,
      providerId,
      firstName,
      lastName,
      picture,
    } = command.dto;

    const newUser = this.userRepository.create({
      id: crypto.randomUUID(),
      email,
      passwordHash: null, // OAuth users have no local password
      role: Role.CUSTOMER,
      isEmailVerified: true, // Verified by OAuth provider
      isActive: true,
    });

    const savedUser = await this.userRepository.save(newUser);

    // Fire & Forget: Emit integration event
    try {
      this.kafkaClient.emit("identity", {
        type: "user.registered",
        data: {
          userId: savedUser.id,
          email: savedUser.email,
          provider,
          providerId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      this.logger.error("Failed to emit user.registered event (OAuth)", err);
    }

    return { id: savedUser.id, email: savedUser.email };
  }
}

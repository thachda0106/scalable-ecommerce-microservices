import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { RegisterCommand } from "../commands/register.command";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as argon2 from "argon2";
import { ConflictException, Inject } from "@nestjs/common";
import { UserOrmEntity } from "../../infrastructure/database/user.orm-entity";
import { Role } from "../../domain/value-objects/role.enum";
import { KAFKA_SERVICE } from "../../infrastructure/kafka/kafka-producer.module";
import { ClientKafka } from "@nestjs/microservices";

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand> {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly userRepository: Repository<UserOrmEntity>,
    @Inject(KAFKA_SERVICE)
    private readonly kafkaClient: ClientKafka,
  ) {}

  async execute(
    command: RegisterCommand,
  ): Promise<{ id: string; email: string }> {
    const { email, password } = command.dto;

    // Check if user exists
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException("Email already exists");
    }

    // Hash password with Argon2
    const passwordHash = await argon2.hash(password);

    // Save to database
    // Note: Generating UUID v4 manually or relying on postgres. Using simple mapped obj for now.
    const newUser = this.userRepository.create({
      id: crypto.randomUUID(), // Assume node 19+ crypto global, or standard DB default
      email,
      passwordHash,
      role: Role.CUSTOMER,
      isEmailVerified: false,
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
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      // In production, log this centrally. Don't block the user registration on event failures.
      console.error("Failed to emit user.registered event", err);
    }

    return {
      id: savedUser.id,
      email: savedUser.email,
    };
  }
}

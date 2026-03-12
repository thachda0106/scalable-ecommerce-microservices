import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException } from "@nestjs/common";
import { RegisterHandler } from "../register.handler";
import { RegisterCommand } from "../../commands/register.command";
import { USER_REPOSITORY } from "../../../domain/ports/user-repository.port";
import { KAFKA_SERVICE } from "../../../infrastructure/kafka/kafka-producer.module";
import { Logger } from "@ecommerce/core";
import { User } from "../../../domain/entities/user.entity";
import { Email } from "../../../domain/value-objects/email.value-object";
import { Password } from "../../../domain/value-objects/password.value-object";
import { Role } from "../../../domain/value-objects/role.enum";

describe("RegisterHandler", () => {
  let handler: RegisterHandler;
  let userRepository: { findByEmail: jest.Mock; save: jest.Mock };
  let kafkaClient: { emit: jest.Mock };
  let logger: { error: jest.Mock };

  const makeUser = (overrides = {}) =>
    User.create({
      id: "user-id-123",
      email: Email.create("test@example.com"),
      password: Password.create("$argon2id$v=19$m=65536,t=3,p=4$fake-hash"),
      role: Role.CUSTOMER,
      isEmailVerified: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });

  beforeEach(async () => {
    userRepository = { findByEmail: jest.fn(), save: jest.fn() };
    kafkaClient = { emit: jest.fn() };
    logger = { error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegisterHandler,
        { provide: USER_REPOSITORY, useValue: userRepository },
        { provide: KAFKA_SERVICE, useValue: kafkaClient },
        { provide: Logger, useValue: logger },
      ],
    }).compile();

    handler = module.get<RegisterHandler>(RegisterHandler);
  });

  it("should register a new user and return id and email", async () => {
    userRepository.findByEmail.mockResolvedValue(null);
    const savedUser = makeUser();
    userRepository.save.mockResolvedValue(savedUser);

    const command = new RegisterCommand({
      email: "test@example.com",
      password: "Password123!",
    });
    const result = await handler.execute(command);

    expect(result.email).toBe("test@example.com");
    expect(result.id).toBeDefined();
    expect(userRepository.findByEmail).toHaveBeenCalledWith("test@example.com");
    expect(userRepository.save).toHaveBeenCalled();
  });

  it("should throw ConflictException if email already exists", async () => {
    userRepository.findByEmail.mockResolvedValue(makeUser());

    const command = new RegisterCommand({
      email: "test@example.com",
      password: "Password123!",
    });

    await expect(handler.execute(command)).rejects.toThrow(ConflictException);
    expect(userRepository.save).not.toHaveBeenCalled();
  });

  it("should emit user.registered Kafka event on success", async () => {
    userRepository.findByEmail.mockResolvedValue(null);
    userRepository.save.mockResolvedValue(makeUser());

    const command = new RegisterCommand({
      email: "test@example.com",
      password: "Password123!",
    });
    await handler.execute(command);

    expect(kafkaClient.emit).toHaveBeenCalledWith(
      "identity",
      expect.objectContaining({ type: "user.registered" }),
    );
  });

  it("should log error (not throw) if Kafka emit fails", async () => {
    userRepository.findByEmail.mockResolvedValue(null);
    userRepository.save.mockResolvedValue(makeUser());
    kafkaClient.emit.mockImplementation(() => {
      throw new Error("Kafka down");
    });

    const command = new RegisterCommand({
      email: "test@example.com",
      password: "Password123!",
    });
    await expect(handler.execute(command)).resolves.toBeDefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it("should hash password via argon2 (not store plaintext)", async () => {
    userRepository.findByEmail.mockResolvedValue(null);
    let savedArgs: User | undefined;
    userRepository.save.mockImplementation((user: User) => {
      savedArgs = user;
      return Promise.resolve(user);
    });

    const command = new RegisterCommand({
      email: "test@example.com",
      password: "PlaintextPass1!",
    });
    await handler.execute(command);

    // The password stored should be an argon2 hash, not plaintext
    const storedHash = savedArgs?.password?.getValue();
    expect(storedHash).toBeDefined();
    expect(storedHash).not.toBe("PlaintextPass1!");
    expect(storedHash).toMatch(/^\$argon2/);
  });
});

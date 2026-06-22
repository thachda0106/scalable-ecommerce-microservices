import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { RegisterHandler } from '../register.handler';
import { RegisterCommand } from '../../commands/register.command';
import { USER_REPOSITORY } from '../../../domain/ports/user-repository.port';
import { UnitOfWork } from '@ecommerce/core';
import { User } from '../../../domain/entities/user.entity';
import { Email } from '../../../domain/value-objects/email.value-object';
import { Password } from '../../../domain/value-objects/password.value-object';
import { Role } from '../../../domain/value-objects/role.enum';

describe('RegisterHandler', () => {
  let handler: RegisterHandler;
  let userRepository: { findByEmail: jest.Mock; save: jest.Mock };
  let unitOfWork: { execute: jest.Mock };

  const makeUser = () =>
    User.create({
      id: 'user-id-123',
      email: Email.create('test@example.com'),
      password: Password.create('$argon2id$v=19$m=65536,t=3,p=4$fake-hash'),
      role: Role.CUSTOMER,
      isEmailVerified: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  beforeEach(async () => {
    userRepository = { findByEmail: jest.fn(), save: jest.fn() };
    unitOfWork = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegisterHandler,
        { provide: USER_REPOSITORY, useValue: userRepository },
        { provide: UnitOfWork, useValue: unitOfWork },
      ],
    }).compile();

    handler = module.get<RegisterHandler>(RegisterHandler);
  });

  it('should register a new user and return id and email', async () => {
    userRepository.findByEmail.mockResolvedValue(null);
    const savedUser = makeUser();
    unitOfWork.execute.mockImplementation(
      async (work: () => Promise<User>) => work(),
    );
    userRepository.save.mockResolvedValue(savedUser);

    const result = await handler.execute(
      new RegisterCommand({
        email: 'test@example.com',
        password: 'Password123!',
      }),
    );

    expect(result.email).toBe('test@example.com');
    expect(result.id).toBeDefined();
    expect(userRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
    expect(unitOfWork.execute).toHaveBeenCalled();
  });

  it('should throw ConflictException if email already exists', async () => {
    userRepository.findByEmail.mockResolvedValue(makeUser());

    await expect(
      handler.execute(
        new RegisterCommand({
          email: 'test@example.com',
          password: 'Password123!',
        }),
      ),
    ).rejects.toThrow(ConflictException);
    expect(unitOfWork.execute).not.toHaveBeenCalled();
  });

  it('should persist user and outbox event atomically via UnitOfWork', async () => {
    userRepository.findByEmail.mockResolvedValue(null);
    const savedUser = makeUser();
    unitOfWork.execute.mockImplementation(
      async (work: () => Promise<User>, events: unknown[]) => {
        expect(events).toHaveLength(1);
        expect((events[0] as { eventType: string }).eventType).toBe('user.registered');
        return work();
      },
    );
    userRepository.save.mockResolvedValue(savedUser);

    await handler.execute(
      new RegisterCommand({
        email: 'test@example.com',
        password: 'Password123!',
      }),
    );

    expect(unitOfWork.execute).toHaveBeenCalled();
  });

  it('should hash password via argon2 (not store plaintext)', async () => {
    userRepository.findByEmail.mockResolvedValue(null);
    let savedArgs: User | undefined;
    userRepository.save.mockImplementation((user: User) => {
      savedArgs = user;
      return Promise.resolve(user);
    });
    unitOfWork.execute.mockImplementation(
      async (work: () => Promise<User>) => work(),
    );

    await handler.execute(
      new RegisterCommand({
        email: 'test@example.com',
        password: 'PlaintextPass1!',
      }),
    );

    const storedHash = savedArgs?.password?.getValue();
    expect(storedHash).toBeDefined();
    expect(storedHash).not.toBe('PlaintextPass1!');
    expect(storedHash).toMatch(/^\$argon2/);
  });
});

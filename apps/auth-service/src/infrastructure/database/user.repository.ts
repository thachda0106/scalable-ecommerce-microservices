import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserOrmEntity } from './user.orm-entity';
import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { User, UserProps } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email.value-object';
import { Password } from '../../domain/value-objects/password.value-object';
import { Role } from '../../domain/value-objects/role.enum';

@Injectable()
export class UserRepository implements UserRepositoryPort {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly ormRepo: Repository<UserOrmEntity>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    const orm = await this.ormRepo.findOne({ where: { email } });
    return orm ? this.toDomain(orm) : null;
  }

  async findById(id: string): Promise<User | null> {
    const orm = await this.ormRepo.findOne({ where: { id } });
    return orm ? this.toDomain(orm) : null;
  }

  async save(user: User): Promise<User> {
    const orm = this.toOrm(user);
    const saved = await this.ormRepo.save(orm);
    return this.toDomain(saved);
  }

  // ---- Mapping helpers ----

  private toDomain(orm: UserOrmEntity): User {
    const props: UserProps = {
      id: orm.id,
      email: Email.create(orm.email),
      password: orm.passwordHash ? Password.create(orm.passwordHash) : null,
      role: orm.role as Role,
      isEmailVerified: orm.isEmailVerified,
      isActive: orm.isActive,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
    };
    return User.create(props);
  }

  private toOrm(user: User): UserOrmEntity {
    const orm = new UserOrmEntity();
    orm.id = user.id;
    orm.email = user.email.getValue();
    orm.passwordHash = user.password ? user.password.getValue() : null;
    orm.role = user.role;
    orm.isEmailVerified = user.isEmailVerified;
    orm.isActive = user.isActive;
    return orm;
  }
}

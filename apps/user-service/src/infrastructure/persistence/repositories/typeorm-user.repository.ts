import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { User } from '../../../domain/entities/user.entity';
import { IUserRepository } from '../../../domain/ports/user-repository.port';
import { UserId } from '../../../domain/value-objects/user-id.vo';
import { Email } from '../../../domain/value-objects/email.vo';
import { Username } from '../../../domain/value-objects/username.vo';
import { UserStatusEnum } from '../../../domain/value-objects/user-status.vo';
import { UserOrmEntity } from '../entities/user.orm-entity';
import { UserMapper } from '../mappers/user.mapper';

@Injectable()
export class TypeOrmUserRepository implements IUserRepository {
  private readonly logger = new Logger(TypeOrmUserRepository.name);

  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly repo: Repository<UserOrmEntity>,
  ) {}

  async save(user: User): Promise<void> {
    const orm = UserMapper.toPersistence(user);
    await this.repo.save(orm);
    this.logger.debug(`User ${user.id.value} saved`);
  }

  async findById(id: UserId): Promise<User | null> {
    const orm = await this.repo.findOne({
      where: { id: id.value },
      relations: ['profile', 'settings'],
    });
    return orm ? UserMapper.toDomain(orm) : null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    const orm = await this.repo.findOne({
      where: { email: email.value },
      relations: ['profile', 'settings'],
    });
    return orm ? UserMapper.toDomain(orm) : null;
  }

  async findByUsername(username: Username): Promise<User | null> {
    const orm = await this.repo.findOne({
      where: { username: username.value },
      relations: ['profile', 'settings'],
    });
    return orm ? UserMapper.toDomain(orm) : null;
  }

  async findAll(options?: {
    page?: number;
    limit?: number;
    status?: UserStatusEnum;
  }): Promise<{ users: User[]; total: number }> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;

    const where: FindOptionsWhere<UserOrmEntity> = {};
    if (options?.status) {
      where.status = options.status;
    }

    const [orms, total] = await this.repo.findAndCount({
      where,
      relations: ['profile', 'settings'],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      users: orms.map(UserMapper.toDomain),
      total,
    };
  }

  async delete(id: UserId): Promise<void> {
    await this.repo.delete(id.value);
    this.logger.debug(`User ${id.value} hard-deleted`);
  }
}

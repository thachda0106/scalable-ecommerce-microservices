import { User } from '../entities/user.entity';
import { UserId } from '../value-objects/user-id.vo';
import { Email } from '../value-objects/email.vo';
import { Username } from '../value-objects/username.vo';
import { UserStatusEnum } from '../value-objects/user-status.vo';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface IUserRepository {
  save(user: User): Promise<void>;
  findById(id: UserId): Promise<User | null>;
  findByEmail(email: Email): Promise<User | null>;
  findByUsername(username: Username): Promise<User | null>;
  findAll(options?: {
    page?: number;
    limit?: number;
    status?: UserStatusEnum;
  }): Promise<{ users: User[]; total: number }>;
  delete(id: UserId): Promise<void>;
}

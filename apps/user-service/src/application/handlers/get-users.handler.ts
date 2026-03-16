import { Injectable, Inject, Logger } from '@nestjs/common';
import { GetUsersQuery } from '../queries/get-users.query';
import { USER_REPOSITORY } from '../../domain/ports/user-repository.port';
import type { IUserRepository } from '../../domain/ports/user-repository.port';
import { UserStatusEnum } from '../../domain/value-objects/user-status.vo';

@Injectable()
export class GetUsersHandler {
  private readonly logger = new Logger(GetUsersHandler.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(query: GetUsersQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const status = query.status as UserStatusEnum | undefined;

    const { users, total } = await this.userRepository.findAll({
      page,
      limit,
      status,
    });

    return {
      users: users.map((u) => u.toJSON()),
      total,
      page,
      limit,
    };
  }
}

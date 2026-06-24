import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { GetUserByUsernameQuery } from '../queries/get-user-by-username.query';
import { Username } from '../../domain/value-objects/username.vo';
import { USER_REPOSITORY } from '../../domain/ports/user-repository.port';
import type { IUserRepository } from '../../domain/ports/user-repository.port';

@Injectable()
export class GetUserByUsernameHandler {
  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(query: GetUserByUsernameQuery) {
    const user = await this.userRepository.findByUsername(
      Username.create(query.username),
    );
    if (!user) {
      throw new NotFoundException(
        `User with username ${query.username} not found`,
      );
    }
    return user.toJSON();
  }
}

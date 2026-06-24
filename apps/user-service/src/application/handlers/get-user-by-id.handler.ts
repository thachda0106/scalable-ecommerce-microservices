import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { GetUserByIdQuery } from '../queries/get-user-by-id.query';
import { UserId } from '../../domain/value-objects/user-id.vo';
import { USER_REPOSITORY } from '../../domain/ports/user-repository.port';
import type { IUserRepository } from '../../domain/ports/user-repository.port';

@Injectable()
export class GetUserByIdHandler {
  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(query: GetUserByIdQuery) {
    const user = await this.userRepository.findById(
      UserId.create(query.userId),
    );
    if (!user) {
      throw new NotFoundException(`User ${query.userId} not found`);
    }
    return user.toJSON();
  }
}

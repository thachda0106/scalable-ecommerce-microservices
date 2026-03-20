import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { GetUserByIdQuery } from '../queries/get-user-by-id.query';
import { UserId } from '../../domain/value-objects/user-id.vo';
import { USER_REPOSITORY } from '../../domain/ports/user-repository.port';
import type { IUserRepository } from '../../domain/ports/user-repository.port';

@Injectable()
export class GetUserByIdHandler {
  private readonly logger = new Logger(GetUserByIdHandler.name);

  constructor(
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

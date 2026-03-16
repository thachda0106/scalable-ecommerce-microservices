import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { GetUserByEmailQuery } from '../queries/get-user-by-email.query';
import { Email } from '../../domain/value-objects/email.vo';
import { USER_REPOSITORY } from '../../domain/ports/user-repository.port';
import type { IUserRepository } from '../../domain/ports/user-repository.port';

@Injectable()
export class GetUserByEmailHandler {
  private readonly logger = new Logger(GetUserByEmailHandler.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(query: GetUserByEmailQuery) {
    const user = await this.userRepository.findByEmail(Email.create(query.email));
    if (!user) {
      throw new NotFoundException(`User with email ${query.email} not found`);
    }
    return user.toJSON();
  }
}

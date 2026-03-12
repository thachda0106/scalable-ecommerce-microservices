import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { LoginQuery } from "../queries/login.query";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as argon2 from "argon2";
import { UnauthorizedException } from "@nestjs/common";
import { UserOrmEntity } from "../../infrastructure/database/user.orm-entity";

@QueryHandler(LoginQuery)
export class LoginHandler implements IQueryHandler<LoginQuery> {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly userRepository: Repository<UserOrmEntity>,
  ) {}

  async execute(
    query: LoginQuery,
  ): Promise<{ id: string; email: string; role: string }> {
    const { email, password } = query.dto;

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const isValidPassword = await argon2.verify(user.passwordHash, password);
    if (!isValidPassword) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // TODO: Generate JWT here in Task 2. For now just return the verified user identifier
    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }
}

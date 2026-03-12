import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { LoginQuery } from "../queries/login.query";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as argon2 from "argon2";
import { UnauthorizedException } from "@nestjs/common";
import { UserOrmEntity } from "../../infrastructure/database/user.orm-entity";
import {
  JwtAdapterService,
  AuthTokens,
} from "../../infrastructure/jwt/jwt-adapter.service";
import { Role } from "../../domain/value-objects/role.enum";

@QueryHandler(LoginQuery)
export class LoginHandler implements IQueryHandler<LoginQuery> {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly userRepository: Repository<UserOrmEntity>,
    private readonly jwtAdapterService: JwtAdapterService,
  ) {}

  async execute(query: LoginQuery): Promise<AuthTokens> {
    const { email, password } = query.dto;

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const isValidPassword = await argon2.verify(user.passwordHash, password);
    if (!isValidPassword) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const role = user.role as Role;

    return this.jwtAdapterService.generateTokens({
      id: user.id,
      email: user.email,
      role: role,
    });
  }
}

import { IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * M1 fix: Define status filter values locally instead of importing from domain layer.
 * This keeps the interface layer decoupled from the domain layer.
 */
const VALID_USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;

export class GetUsersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(VALID_USER_STATUSES)
  status?: string;
}

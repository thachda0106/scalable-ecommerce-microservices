import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ReindexRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(10000)
  batchSize?: number = 1000;
}

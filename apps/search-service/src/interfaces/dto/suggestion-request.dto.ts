import { IsString, IsOptional, IsInt, Min, Max, MinLength, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class SuggestionRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  prefix: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 10;
}

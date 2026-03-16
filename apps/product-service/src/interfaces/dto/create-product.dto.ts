import { IsString, IsNotEmpty, IsNumber, Min, IsOptional } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @Min(0.01)
  price: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsNotEmpty()
  categoryId: string;
}

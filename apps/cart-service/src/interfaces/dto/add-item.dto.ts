import { IsUUID, IsInt, Min, Max, IsNumber, IsPositive } from 'class-validator';

export class AddItemDto {
  @IsUUID('4', { message: 'productId must be a valid UUID v4' })
  productId: string;

  @IsInt({ message: 'quantity must be an integer' })
  @Min(1, { message: 'quantity must be at least 1' })
  @Max(99, { message: 'quantity cannot exceed 99' })
  quantity: number;

  @IsNumber({}, { message: 'snapshottedPrice must be a number' })
  @IsPositive({ message: 'snapshottedPrice must be positive' })
  @Max(999999.99, { message: 'snapshottedPrice cannot exceed 999999.99' })
  snapshottedPrice: number;
}

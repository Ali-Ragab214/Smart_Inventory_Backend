import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSkuDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }) => (value as string).trim().toUpperCase())
  @Matches(/^[A-Z0-9-_]+$/, {
    message: 'sku can only contain uppercase letters, digits, hyphens and underscores',
  })
  sku!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  @Transform(({ value }) => (value as string).trim())
  name!: string;

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  cost!: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  price!: number;

  @IsUUID()
  @IsOptional()
  preferredVendorId?: string;
}

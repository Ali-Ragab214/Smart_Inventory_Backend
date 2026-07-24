import {
  IsEmail,
  IsEnum,
  IsString,
  IsUUID,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
} from "class-validator";
import { UserRole } from "../entities/user.entity";

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  username: string;

  @IsString()
  @MinLength(8)
  @MaxLength(255)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      "Password must contain uppercase, lowercase, number, and special character",
  })
  password: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  warehouseName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  warehouseLocation?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

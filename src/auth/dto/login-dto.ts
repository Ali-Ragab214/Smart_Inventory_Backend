import {
  IsString,
  MinLength, 
  MaxLength, 
  Matches 
} from "class-validator";


export class LoginUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  emailOrUsername: string;

  @IsString()
  @MinLength(8)
  @MaxLength(255)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/, {
    message:
      "Password must contain uppercase, lowercase, number, and special character",
  })
  password: string;
}
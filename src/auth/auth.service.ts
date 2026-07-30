import { Injectable, UnauthorizedException } from "@nestjs/common";
import { UsersService } from "../users/users.service";
import { JwtService } from "@nestjs/jwt";
import { CreateUserDto } from "../users/dto/create-user.dto";
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService
  ) {}

  async signIn(usernameOrEmail: string, password: string): Promise<any> {
    let user = await this.usersService.findByEmailForAuth(usernameOrEmail);
    user ??= await this.usersService.findByUsernameForAuth(usernameOrEmail);

    if (!user || !(await user.comparePassword(password))) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      warehouseId: user.warehouseId,
    };
    const userDto = await this.usersService.findById(user.id);
    return {
      user: userDto,
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  async signup(createUserDto: CreateUserDto): Promise<any> {
    const user = await this.usersService.create(createUserDto);
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      warehouseId: user.warehouseId,
    };
    return {
      user,
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}

import { Module } from "@nestjs/common";
import { JwtModule, type JwtSignOptions } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PassportModule } from "@nestjs/passport";
import { UsersModule } from "../users/users.module";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { GoogleStrategy } from "./strategies/google.strategy";
import { TenantsModule } from "../tenants/tenants.module";

@Module({
  imports: [
    PassportModule,
    UsersModule,
    TenantsModule,
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: (
            config.get<string>("JWT_EXPIRES_IN") ??
            config.get<string>("JWT_EXPIRATION", "24h")
          ) as JwtSignOptions["expiresIn"],
        },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, GoogleStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
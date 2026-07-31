import { Injectable, UnauthorizedException, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { UsersService } from "../users/users.service";
import { JwtService } from "@nestjs/jwt";
import { CreateUserDto } from "../users/dto/create-user.dto";
import * as crypto from 'crypto';
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import * as nodemailer from 'nodemailer';
@Injectable()
export class AuthService {
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService
  ) {
    this.initMailTransporter();
  }

  private async initMailTransporter() {
    try {
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        // Use real SMTP configuration if provided
        this.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587', 10),
          secure: process.env.SMTP_PORT === '465',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
        Logger.log(`Real SMTP email account configured: ${process.env.SMTP_HOST}`);
      } else {
        // Fallback to Ethereal fake email for development
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: "smtp.ethereal.email",
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
        Logger.log('Ethereal test email account created successfully.');
      }
    } catch (err) {
      Logger.error('Failed to configure email transporter', err);
    }
  }


  async signIn(usernameOrEmail: string, password: string): Promise<any> {
    let user = await this.usersService.findByEmailForAuth(usernameOrEmail);
    user ??= await this.usersService.findByUsernameForAuth(usernameOrEmail);

    if (!user || !(await user.comparePassword(password))) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const payload = { sub: user.id, username: user.username };
    const userDto = await this.usersService.findById(user.id);
    return {
      user: userDto,
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  async signup(createUserDto: CreateUserDto): Promise<any> {
    const user = await this.usersService.create(createUserDto);
    const payload = { sub: user.id, username: user.username };
    return {
      user,
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.usersService.findByEmailForAuth(forgotPasswordDto.email);
    if (!user) {
      // Return success even if user not found to prevent email enumeration
      return { message: 'If that email is in our database, we will send a password reset link to it.' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const passwordResetExpires = new Date();
    passwordResetExpires.setHours(passwordResetExpires.getHours() + 1); // 1 hour expiration

    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpires = passwordResetExpires;
    
    await this.usersService.saveRawUser(user);

    const resetUrl = `http://localhost:5173/reset-password?token=${resetToken}`;
    
    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from: process.env.SMTP_FROM || '"StockSavvy Security" <security@stocksavvy.com>',
          to: user.email,
          subject: "Password Reset Request",
          text: `You requested a password reset. Click the following link to reset your password: ${resetUrl}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2>Password Reset</h2>
              <p>You requested a password reset for your StockSavvy account.</p>
              <p>Click the link below to reset your password:</p>
              <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #001A40; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
              <p style="margin-top: 20px; font-size: 12px; color: #666;">If you did not request this, please ignore this email.</p>
            </div>
          `,
        });
        Logger.log(`[Email Sent] Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      } catch (err) {
        Logger.error('Failed to send reset email', err);
      }
    } else {
      Logger.log(`[Mock Email] Password reset link for ${user.email}: ${resetUrl}`);
    }

    return { message: 'If that email is in our database, we will send a password reset link to it.' };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<{ message: string }> {
    const hashedToken = crypto.createHash('sha256').update(resetPasswordDto.token).digest('hex');

    const user = await this.usersService.findByResetTokenForAuth(hashedToken);

    if (!user || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      throw new BadRequestException({ message: 'Token is invalid or has expired', code: 'INVALID_TOKEN' });
    }

    user.passwordHash = resetPasswordDto.newPassword; // Will be hashed by @BeforeUpdate in entity
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    await this.usersService.saveRawUser(user);

    return { message: 'Password has been successfully reset. You can now login.' };
  }
}

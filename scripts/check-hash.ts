import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/users/users.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);

  const user = await usersService.findByEmailForAuth('tenant1@example.com');
  console.log('User found:', user ? user.email : 'No');
  if (user) {
    console.log('Password Hash:', user.passwordHash);
    console.log('Is valid bcrypt hash format?', user.passwordHash?.startsWith('$2a$') || user.passwordHash?.startsWith('$2b$'));
    
    // Test comparison directly
    const isValid = await user.comparePassword('Password123!');
    console.log('Password123! is valid?', isValid);
  }

  await app.close();
}

bootstrap().catch(console.error);

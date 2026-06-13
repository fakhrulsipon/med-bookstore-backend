// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AdminJwtStrategy } from './admin-jwt.strategy';
import { StudentJwtStrategy } from './student-jwt.strategy';
import { JWT_SECRET } from './jwt.constants';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'admin-jwt' }),
    DatabaseModule,
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: { expiresIn: '1d' },
    }),
  ],
  providers: [AuthService, AdminJwtStrategy, StudentJwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}

import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthGuard, OnboardedGuard, OperatorGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { GoogleService } from './google.service';
import { SessionService } from './session.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('SESSION_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleService,
    SessionService,
    AuthGuard,
    OnboardedGuard,
    OperatorGuard,
  ],
  exports: [SessionService, AuthGuard, OnboardedGuard, OperatorGuard],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './infra/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { InterestsModule } from './modules/interests/interests.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { ParametersModule } from './modules/parameters/parameters.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 배치는 인프로세스 cron이다. 프로세스가 하나라 분산 락이 필요 없다(design/20 §7).
    ScheduleModule.forRoot(),
    PrismaModule,
    ParametersModule,
    AuthModule,
    UsersModule,
    InterestsModule,
    OnboardingModule,
  ],
})
export class AppModule {}

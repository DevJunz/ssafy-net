import { Module } from '@nestjs/common';
import { InterestsModule } from '../interests/interests.module';
import { UsersModule } from '../users/users.module';
import { MattermostVerificationService } from './mattermost-verification.service';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [InterestsModule, UsersModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, MattermostVerificationService],
})
export class OnboardingModule {}

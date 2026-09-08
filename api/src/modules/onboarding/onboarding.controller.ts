import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import {
  displayNameSchema,
  identitySchema,
  notificationSetupSchema,
  type DisplayNameInput,
  type IdentityInput,
  type NotificationSetupInput,
} from '@ssafy-net/shared';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthGuard } from '../auth/auth.guard';
import { NicknameService } from '../users/nickname.service';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
@UseGuards(AuthGuard)
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly nickname: NicknameService,
  ) {}

  @Get('state')
  state(@CurrentUser() user: User) {
    return this.onboarding.state(user);
  }

  @Post('identity')
  setIdentity(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(identitySchema)) body: IdentityInput,
  ) {
    return this.onboarding.setIdentity(user, body);
  }

  /** 입력 중 실시간 검사(docs/06 §3.1.3). 중복·실명 유사·부적절 표현. */
  @Get('nickname-check')
  async checkNickname(
    @CurrentUser() user: User,
    @Query('value') value: string,
  ) {
    const verdict = await this.nickname.check(value ?? '', user.id);
    return verdict.ok
      ? { ok: true }
      : { ok: false, code: verdict.code };
  }

  @Post('display-name')
  setDisplayName(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(displayNameSchema)) body: DisplayNameInput,
  ) {
    return this.onboarding.setDisplayName(user, body);
  }

  @Post('notifications')
  setNotifications(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(notificationSetupSchema))
    body: NotificationSetupInput,
  ) {
    return this.onboarding.setNotifications(user, body);
  }
}

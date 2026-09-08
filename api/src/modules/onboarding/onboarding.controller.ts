import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import {
  displayNameSchema,
  mattermostSendSchema,
  mattermostVerifySchema,
  type DisplayNameInput,
  type MattermostSendInput,
  type MattermostVerifyInput,
} from '@ssafy-net/shared';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthGuard } from '../auth/auth.guard';
import { NicknameService } from '../users/nickname.service';
import { MattermostVerificationService } from './mattermost-verification.service';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
@UseGuards(AuthGuard)
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly nickname: NicknameService,
    private readonly verification: MattermostVerificationService,
  ) {}

  @Get('state')
  state(@CurrentUser() user: User) {
    return this.onboarding.state(user);
  }

  /**
   * Mattermost 계정 인증 (D-66). 소속 검증과 알림 채널 확보를 겸한다.
   * 실명도 여기서 함께 받아 DM 본문에 넣는다 — 이름이 틀리면 받는 사람이 알아차린다.
   */
  @Post('mattermost/send')
  sendCode(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(mattermostSendSchema)) body: MattermostSendInput,
  ) {
    return this.verification.sendCode(user, body);
  }

  @Post('mattermost/verify')
  verifyCode(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(mattermostVerifySchema))
    body: MattermostVerifyInput,
  ) {
    return this.verification.verify(user, body.code);
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

  /** 관심사를 저장하면 온보딩이 끝난다. 알림 설정 단계는 없앴다(D-67). */
  @Post('complete')
  complete(@CurrentUser() user: User) {
    return this.onboarding.complete(user);
  }
}

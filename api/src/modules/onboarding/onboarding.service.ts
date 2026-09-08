import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type {
  DisplayNameInput,
  IdentityInput,
  NotificationSetupInput,
  OnboardingState,
} from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { InterestsService } from '../interests/interests.service';
import { ParametersService } from '../parameters/parameters.service';
import { NicknameService } from '../users/nickname.service';
import { UserPresenter } from '../users/user.presenter';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parameters: ParametersService,
    private readonly interests: InterestsService,
    private readonly nickname: NicknameService,
    private readonly presenter: UserPresenter,
  ) {}

  /**
   * 중단 후 다시 들어오면 멈춘 지점부터 이어서 한다(J0 Failure State).
   * 어디서 멈췄는지는 저장하지 않고 사용자 상태에서 계산한다.
   */
  async state(user: User): Promise<OnboardingState> {
    const preview = this.presenter.fullRealName(user);

    if (!user.realName || !user.classNo) {
      return { step: 'IDENTITY', realNamePreview: null };
    }
    if (user.displayNameType === 'NICKNAME' && !user.nickname) {
      return { step: 'DISPLAY_NAME', realNamePreview: preview };
    }

    const min = await this.parameters.get('P-01');
    const count = await this.prisma.userInterest.count({
      where: { userId: user.id },
    });
    if (count < min) {
      return { step: 'INTERESTS', realNamePreview: preview };
    }

    if (user.status !== 'ACTIVE') {
      return { step: 'NOTIFICATIONS', realNamePreview: preview };
    }
    return { step: 'DONE', realNamePreview: preview };
  }

  /**
   * 실명은 이름과 반을 따로 받아 "이름_캠퍼스_반"으로 조합한다(D-47).
   * 검증하지 않고 사용자를 신뢰한다(docs/12 §2). 허위 실명은 연결 후
   * 메신저에서 못 찾는 결과로 드러나고 후속 확인 "찾지 못함"으로 관찰한다.
   */
  async setIdentity(user: User, input: IdentityInput) {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { realName: input.realName, classNo: input.classNo },
    });
    return {
      realNamePreview: this.presenter.fullRealName(updated),
      state: await this.state(updated),
    };
  }

  async setDisplayName(user: User, input: DisplayNameInput) {
    if (input.type === 'REAL') {
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: { displayNameType: 'REAL', nickname: null },
      });
      return { displayName: this.presenter.displayName(updated) };
    }

    const verdict = await this.nickname.check(input.nickname, user.id);
    if (!verdict.ok) throw new AppError(verdict.code);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        displayNameType: 'NICKNAME',
        nickname: input.nickname.trim(),
        nicknameChangedAt: new Date(),
      },
    });
    return { displayName: this.presenter.displayName(updated) };
  }

  /**
   * 온보딩의 마지막 단계. 여기서 status가 ACTIVE가 되고
   * 그때부터 그래프와 다른 사람의 추천 대상에 들어간다(FR-1.6).
   */
  async setNotifications(user: User, input: NotificationSetupInput) {
    const min = await this.parameters.get('P-01');
    const count = await this.prisma.userInterest.count({
      where: { userId: user.id },
    });
    if (count < min) throw new AppError('INTEREST_COUNT_MIN', { min });

    await this.prisma.$transaction(async (tx) => {
      const rows = [
        // 앱 내 알림함은 끌 수 없다. 외부 채널이 전부 실패해도 남는 통로다(design/20 §8).
        { channel: 'IN_APP' as const, category: 'IMMEDIATE' as const, enabled: true },
        { channel: 'IN_APP' as const, category: 'DIGEST' as const, enabled: true },
        { channel: 'EMAIL' as const, category: 'IMMEDIATE' as const, enabled: input.email },
        { channel: 'EMAIL' as const, category: 'DIGEST' as const, enabled: input.email },
        { channel: 'WEB_PUSH' as const, category: 'IMMEDIATE' as const, enabled: input.webPush },
        { channel: 'WEB_PUSH' as const, category: 'DIGEST' as const, enabled: false },
      ];

      for (const row of rows) {
        await tx.notificationSetting.upsert({
          where: {
            userId_channel_category: {
              userId: user.id,
              channel: row.channel,
              category: row.category,
            },
          },
          update: { enabled: row.enabled },
          create: { userId: user.id, ...row },
        });
      }

      if (user.status === 'ONBOARDING') {
        await tx.user.update({
          where: { id: user.id },
          data: { status: 'ACTIVE', onboardedAt: new Date() },
        });
      }
    });

    const refreshed = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    const interests = await this.interests.refsFor(user.id);

    // TODO(M5): 온보딩 완료 즉시 Network 후보를 계산해 최선 1개를 노출한다(docs/10 §2a).
    return {
      user: this.presenter.toSelfUser(refreshed, interests),
      state: await this.state(refreshed),
    };
  }
}

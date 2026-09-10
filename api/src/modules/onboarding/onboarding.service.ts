import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { DisplayNameInput, OnboardingState } from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { InterestsService } from '../interests/interests.service';
import { ParametersService } from '../parameters/parameters.service';
import { UserPresenter } from '../users/user.presenter';
import { UsersService } from '../users/users.service';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parameters: ParametersService,
    private readonly interests: InterestsService,
    private readonly users: UsersService,
    private readonly presenter: UserPresenter,
  ) {}

  /**
   * 중단 후 다시 들어오면 멈춘 지점부터 이어서 한다(J0 Failure State).
   * 어디서 멈췄는지는 저장하지 않고 사용자 상태에서 계산한다.
   *
   * 첫 단계가 **Mattermost 인증**이다(D-66). 여기서 막히면 그 뒤는 의미가 없으므로
   * 가장 앞에 둔다 — 소속이 확인되지 않은 사람이 관심사를 고르게 하지 않는다.
   */
  async state(user: User): Promise<OnboardingState> {
    const preview = this.presenter.fullRealName(user);
    const base = {
      realNamePreview: preview,
      mattermostUsername: user.mattermostUsername,
      codeSent: false,
    };

    if (!user.mattermostVerifiedAt) {
      const pending = await this.prisma.mattermostVerification.findFirst({
        where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        select: { username: true },
      });
      return {
        ...base,
        step: 'MATTERMOST',
        codeSent: Boolean(pending),
        mattermostUsername: pending?.username ?? null,
      };
    }

    if (user.displayNameType === 'NICKNAME' && !user.nickname) {
      return { ...base, step: 'DISPLAY_NAME' };
    }

    const min = await this.parameters.get('P-01');
    const count = await this.prisma.userInterest.count({
      where: { userId: user.id },
    });
    if (count < min) {
      return { ...base, step: 'INTERESTS' };
    }

    return { ...base, step: 'DONE' };
  }

  /** 온보딩의 첫 표시명. 하루 1회 규칙은 여기서 세지 않는다(UsersService.setDisplayName). */
  setDisplayName(user: User, input: DisplayNameInput) {
    // ACTIVE 사용자가 이 엔드포인트로 하루 1회를 피해 가지 못하게 한다.
    return this.users.setDisplayName(user, input, {
      initial: user.status === 'ONBOARDING',
    });
  }

  /**
   * 온보딩 완료 (관심사 저장 직후).
   *
   * 알림 설정 단계는 없앴다(D-67). 채널이 Mattermost 하나뿐이라 고를 것이 없고,
   * 인증 단계에서 이미 그 계정을 확인했다. 온보딩은 3단계로 유지된다.
   * 채널을 끄고 켜는 것은 설정 화면에서 한다.
   *
   * 여기서 status가 ACTIVE가 되고, 그때부터 그래프와 다른 사람의 추천 대상에
   * 들어간다(FR-1.6).
   */
  async complete(user: User) {
    // Mattermost 인증이 SSAFY 소속 검증을 겸한다(D-66). 화면은 순서를 지키지만
    // 이 엔드포인트는 직접 호출할 수 있으므로, ACTIVE가 되는 자리에서 다시 확인한다.
    // 여기를 통과하면 그래프와 다른 사람의 추천에 실려 나간다(FR-1.6).
    if (!user.mattermostVerifiedAt) {
      throw new AppError(
        'FORBIDDEN',
        undefined,
        'Mattermost 계정 인증을 먼저 마쳐야 합니다.',
      );
    }

    const min = await this.parameters.get('P-01');
    const count = await this.prisma.userInterest.count({
      where: { userId: user.id },
    });
    if (count < min) throw new AppError('INTEREST_COUNT_MIN', { min });

    await this.prisma.$transaction(async (tx) => {
      const rows = [
        // 앱 내 알림함은 끌 수 없다. 채널이 하나뿐이라 이것이 유일한 대비책이다.
        { channel: 'IN_APP' as const, category: 'IMMEDIATE' as const, enabled: true },
        { channel: 'IN_APP' as const, category: 'DIGEST' as const, enabled: true },
        // 사내 메신저가 유일한 외부 채널이다(D-66, D-67).
        { channel: 'MATTERMOST' as const, category: 'IMMEDIATE' as const, enabled: true },
        { channel: 'MATTERMOST' as const, category: 'DIGEST' as const, enabled: true },
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

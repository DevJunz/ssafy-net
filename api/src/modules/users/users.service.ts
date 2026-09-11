import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type {
  ConnectedUser,
  DisplayNameInput,
  IdentityInput,
  InterestRef,
  NotificationPrefs,
  ProfileMessageInput,
  PublicUser,
} from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RelationService } from '../connections/relation.service';
import { PostsService } from '../posts/posts.service';
import { nextDisplayNameChangeAt } from './display-name-policy';
import { BANNED_WORDS, NicknameService } from './nickname.service';
import { UserPresenter } from './user.presenter';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relations: RelationService,
    private readonly presenter: UserPresenter,
    private readonly posts: PostsService,
    private readonly nickname: NicknameService,
  ) {}

  /**
   * Person Profile (docs/06 §3.4).
   *
   * 관심사는 전체를 보여주되 공통을 앞에 모아 구분한다.
   * 실명은 연결됨 상태에서만 나간다 — ConnectedUser를 쓰는 유일한 조건이다
   * (design/20 §11, docs/12 §1).
   */
  async profile(
    me: User,
    targetId: string,
  ): Promise<PublicUser | ConnectedUser> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new AppError('NOT_FOUND');

    // 온보딩을 마치지 않은 사람은 다른 사람에게 보이지 않는다(FR-1.6).
    if (target.status === 'ONBOARDING' && target.id !== me.id) {
      throw new AppError('NOT_FOUND');
    }

    if (target.status === 'WITHDRAWN') {
      return this.presenter.toPublicUser(target);
    }

    const [theirInterests, myInterestIds, relation, recentPosts] = await Promise.all([
      this.prisma.userInterest.findMany({
        where: { userId: targetId },
        include: { interest: { include: { category: true } } },
      }),
      this.prisma.userInterest
        .findMany({ where: { userId: me.id }, select: { interestId: true } })
        .then((rows) => new Set(rows.map((row) => row.interestId))),
      this.relations.forUser(me.id, targetId),
      // 글은 "이 사람이 무엇을 이야기하고 싶어 하는지"를 보여준다(docs/11 §1).
      this.posts.byAuthor(targetId),
    ]);

    const refs: InterestRef[] = theirInterests
      .map((row) => ({
        id: row.interest.id,
        name: row.interest.name,
        categoryId: row.interest.categoryId,
        isCommon: myInterestIds.has(row.interest.id),
      }))
      // 공통 관심사를 앞에 모은다(docs/06 §3.4).
      .sort((a, b) => Number(b.isCommon) - Number(a.isCommon));

    // 같은 층은 칩으로는 강조하되(isCommon) 공통 개수에는 세지 않는다(D-72).
    const commonCount = theirInterests.filter(
      (row) =>
        row.interest.category.kind === 'INTEREST' &&
        myInterestIds.has(row.interest.id),
    ).length;

    const view =
      relation.status === 'CONNECTED'
        ? this.presenter.toConnectedUser(target, refs, relation, commonCount)
        : this.presenter.toPublicUser(target, refs, relation, commonCount);

    return { ...view, recentPosts };
  }

  /**
   * 표시명 변경 (docs/06 §3.10, docs/12 §3).
   *
   * 온보딩의 첫 선택(`initial`)과 프로필에서의 변경이 같은 길을 쓴다. 다른 점은 둘이다 —
   * 프로필에서는 하루 1회(`NICKNAME_CHANGE_TOO_SOON`)이고, 같은 값을 다시 저장하면 아무것도
   * 하지 않는다. 닉네임 규칙(중복·실명 유사·부적절 표현, D-49)은 두 경우 모두 검사한다.
   * 온보딩에서 고른 첫 표시명은 변경으로 세지 않는다(display-name-policy.ts).
   */
  async setDisplayName(
    user: User,
    input: DisplayNameInput,
    options: { initial?: boolean } = {},
  ): Promise<{ displayName: string }> {
    const nickname = input.type === 'NICKNAME' ? input.nickname.trim() : null;

    if (!options.initial) {
      const unchanged =
        user.displayNameType === input.type &&
        (input.type === 'REAL' || user.nickname === nickname);
      if (unchanged) return { displayName: this.presenter.displayName(user) };

      const nextAt = nextDisplayNameChangeAt(user);
      if (nextAt) {
        throw new AppError('NICKNAME_CHANGE_TOO_SOON', {
          nextChangeAt: nextAt.toISOString(),
        });
      }
    }

    if (nickname !== null) {
      const verdict = await this.nickname.check(nickname, user.id);
      if (!verdict.ok) throw new AppError(verdict.code);
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        displayNameType: input.type,
        nickname,
        nicknameChangedAt: new Date(),
      },
    });
    return { displayName: this.presenter.displayName(updated) };
  }

  /**
   * 실명 수정 (docs/06 §3.10). 이름과 반만 바뀐다 — 캠퍼스는 고정이다(D-47).
   * 연결된 상대에게 보이는 이름이 바뀌고, 실명으로 활동 중이면 표시명도 바뀐다.
   * 하루 1회 규칙은 표시명 선택에만 걸린다(docs/12 §3) — 오타 고치기를 막지 않는다.
   */
  async setRealName(
    user: User,
    input: IdentityInput,
  ): Promise<{ realName: string }> {
    const realName = input.realName.trim();
    const classNo = input.classNo.trim();

    if (BANNED_WORDS.some((word) => realName.toLowerCase().includes(word))) {
      throw new AppError(
        'VALIDATION_FAILED',
        undefined,
        '이름에 쓸 수 없는 말이 들어 있습니다.',
      );
    }

    if (user.realName === realName && user.classNo === classNo) {
      return { realName: this.presenter.fullRealName(user) ?? '' };
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { realName, classNo },
    });
    return { realName: this.presenter.fullRealName(updated) ?? '' };
  }

  /**
   * 프로필 메시지 (D-85). 사람 패널에서 표시명 아래에 보이는 한 줄이다.
   * 빈 문자열이면 지운다. 금칙어는 닉네임과 같은 목록을 본다 — 연결 전 누구에게나 보이는 글이다.
   */
  /**
   * 탈퇴 (docs/12 §10, 06 §3.11).
   *
   * 계정 행은 남기고 사람에 해당하는 것을 전부 지운다 — 성립된 연결이 상대의 목록에서
   * 통째로 사라지면 상대는 자기 기억을 의심하게 된다. 그 자리에는 "탈퇴한 사용자" 가 남는다(D-64).
   *
   * 지우는 것   프로필(실명·닉네임·메신저 아이디·프로필 메시지·로그인 계정), 관심사 선택과 이력,
   *             글 전부(11 §탈퇴), 진행 중인 요청, 주고받은 요청 메시지, 후속 확인, 알림과 알림 설정
   * 남는 것     성립된 연결과 네트워크(상대 화면에 "탈퇴한 사용자"), 개인 식별 없는 집계
   *
   * `googleSub` 을 비우므로 **같은 Google 계정으로 다시 가입할 수 있다.** 옛 데이터는 돌아오지 않는다.
   */
  async withdraw(user: User): Promise<void> {
    if (user.isOperator) {
      const others = await this.prisma.user.count({
        where: { isOperator: true, status: { not: 'WITHDRAWN' }, id: { not: user.id } },
      });
      if (others === 0) {
        throw new AppError(
          'VALIDATION_FAILED',
          undefined,
          '마지막 운영자는 탈퇴할 수 없습니다. 다른 사람을 운영자로 추가한 뒤 탈퇴합니다.',
        );
      }
    }

    const mine = await this.prisma.userInterest.findMany({
      where: { userId: user.id },
      select: { interestId: true },
    });
    const interestIds = mine.map((row) => row.interestId);
    const involved = { OR: [{ requesterId: user.id }, { targetId: user.id }] };

    await this.prisma.$transaction(async (tx) => {
      // 진행 중인 요청은 닫고, 주고받은 메시지는 지운다(12 §10). 상태 기록은 집계를 위해 남는다.
      await tx.connectionRequest.updateMany({
        where: { ...involved, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      await tx.connectionRequest.updateMany({ where: involved, data: { message: '' } });

      await tx.interestPost.deleteMany({ where: { authorId: user.id } });
      await tx.userInterest.deleteMany({ where: { userId: user.id } });
      await tx.userInterestChange.deleteMany({ where: { userId: user.id } });
      if (interestIds.length > 0) {
        await tx.interest.updateMany({
          where: { id: { in: interestIds } },
          data: { holderCount: { decrement: 1 } },
        });
      }

      // 아직 열려 있는 추천에서 뺀다. 남은 인원이 3 미만이면 그 추천은 조기 소멸한다(10 §5).
      const open = await tx.networkMember.findMany({
        where: { userId: user.id, recommendation: { status: 'OPEN' } },
        select: { recommendationId: true },
      });
      if (open.length > 0) {
        const recommendationIds = open.map((member) => member.recommendationId);
        await tx.networkMember.deleteMany({
          where: { userId: user.id, recommendationId: { in: recommendationIds } },
        });
        for (const recommendationId of recommendationIds) {
          const left = await tx.networkMember.count({ where: { recommendationId } });
          if (left < 3) {
            await tx.networkRecommendation.update({
              where: { id: recommendationId },
              data: { status: 'DISSOLVED' },
            });
          }
        }
      }

      await tx.followUpCheck.deleteMany({ where: { userId: user.id } });
      await tx.notification.deleteMany({ where: { userId: user.id } });
      await tx.notificationSetting.deleteMany({ where: { userId: user.id } });
      await tx.mattermostVerification.deleteMany({ where: { userId: user.id } });

      await tx.user.update({
        where: { id: user.id },
        data: {
          status: 'WITHDRAWN',
          withdrawnAt: new Date(),
          // 같은 계정으로 다시 가입할 수 있도록 비운다(schema 의 googleSub 주석).
          googleSub: null,
          email: null,
          realName: null,
          classNo: null,
          nickname: null,
          mattermostUsername: null,
          mattermostVerifiedAt: null,
          profileMessage: null,
          isOperator: false,
        },
      });
    });
  }

  /**
   * 메신저 알림 받기 설정 (FR-14.2).
   *
   * 행이 없으면 켜진 것으로 본다 — 온보딩에서 만들지만 그 전에 물어볼 수도 있다.
   * 앱 내 알림함(IN_APP)은 건드리지 않는다. 끌 수 없다.
   */
  async notificationPrefs(userId: string): Promise<NotificationPrefs> {
    const rows = await this.prisma.notificationSetting.findMany({
      where: { userId, channel: 'MATTERMOST' },
      select: { category: true, enabled: true },
    });
    const value = (category: 'IMMEDIATE' | 'DIGEST') =>
      rows.find((row) => row.category === category)?.enabled ?? true;
    return { immediate: value('IMMEDIATE'), digest: value('DIGEST') };
  }

  async setNotificationPrefs(
    userId: string,
    input: Partial<NotificationPrefs>,
  ): Promise<NotificationPrefs> {
    const pairs: [('IMMEDIATE' | 'DIGEST'), boolean | undefined][] = [
      ['IMMEDIATE', input.immediate],
      ['DIGEST', input.digest],
    ];
    for (const [category, enabled] of pairs) {
      if (enabled === undefined) continue;
      await this.prisma.notificationSetting.upsert({
        where: {
          userId_channel_category: { userId, channel: 'MATTERMOST', category },
        },
        update: { enabled },
        create: { userId, channel: 'MATTERMOST', category, enabled },
      });
    }
    return this.notificationPrefs(userId);
  }

  async setProfileMessage(
    user: User,
    input: ProfileMessageInput,
  ): Promise<{ profileMessage: string | null }> {
    const message = input.message.trim().replace(/[ \t]+/g, ' ');

    if (BANNED_WORDS.some((word) => message.toLowerCase().includes(word))) {
      throw new AppError(
        'VALIDATION_FAILED',
        undefined,
        '프로필 메시지에 쓸 수 없는 말이 들어 있습니다.',
      );
    }

    const next = message.length > 0 ? message : null;
    if ((user.profileMessage || null) === next) return { profileMessage: next };

    await this.prisma.user.update({
      where: { id: user.id },
      data: { profileMessage: next },
    });
    return { profileMessage: next };
  }
}

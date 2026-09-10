import { Injectable, Logger } from '@nestjs/common';
import type { NetworkMember, NetworkRecommendation, User } from '@prisma/client';
import type {
  InterestRef,
  NetworkDetail,
  NetworkMemberView,
  NetworkSummary,
} from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ParametersService } from '../parameters/parameters.service';
import { QuestionsService } from '../questions/questions.service';
import { UserPresenter } from '../users/user.presenter';

const DAY_MS = 86_400_000;

type Loaded = NetworkRecommendation & {
  members: (NetworkMember & { user: User })[];
};

@Injectable()
export class NetworksService {
  private readonly logger = new Logger(NetworksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parameters: ParametersService,
    private readonly presenter: UserPresenter,
    private readonly notifications: NotificationsService,
    private readonly questions: QuestionsService,
  ) {}

  private async assertEnabled(): Promise<void> {
    if (!(await this.parameters.flag('network_enabled'))) {
      throw new AppError('NETWORK_DISABLED');
    }
  }

  async list(me: User, tab: string): Promise<NetworkSummary[]> {
    await this.assertEnabled();

    const rows = await this.prisma.networkRecommendation.findMany({
      where: {
        members: { some: { userId: me.id, decision: { not: 'DECLINED' } } },
        ...(tab === 'activated'
          ? { status: 'ACTIVATED' }
          : { status: 'OPEN', expiresAt: { gt: new Date() } }),
      },
      include: { members: { include: { user: true } } },
      orderBy: { exposedAt: 'desc' },
    });

    const filtered =
      tab === 'joined'
        ? rows.filter(
            (row) =>
              row.members.find((m) => m.userId === me.id)?.decision === 'JOINED',
          )
        : tab === 'recommended'
          ? rows.filter(
              (row) =>
                row.members.find((m) => m.userId === me.id)?.decision ===
                'PENDING',
            )
          : rows;

    const required = await this.parameters.get('P-09');
    const interests = await this.interestRefs(
      filtered.flatMap((row) => row.commonInterestIds),
    );

    return filtered.map((row) => this.toSummary(row, me, required, interests));
  }

  async detail(me: User, id: string): Promise<NetworkDetail> {
    await this.assertEnabled();

    const row = await this.load(id);
    const mine = row.members.find((member) => member.userId === me.id);
    if (!mine) throw new AppError('NOT_FOUND');

    const required = await this.parameters.get('P-09');
    const interests = await this.interestRefs(row.commonInterestIds);
    const summary = this.toSummary(row, me, required, interests);

    const activated = row.status === 'ACTIVATED';
    const joined = row.members
      .filter((member) => member.decision === 'JOINED')
      .sort((a, b) => (a.joinOrder ?? 0) - (b.joinOrder ?? 0));

    const initiator = row.initiatorId
      ? row.members.find((member) => member.userId === row.initiatorId)
      : undefined;

    // 성립 전에는 표시명만, 성립 후에는 **참여자에게만** 실명이 공개된다(docs/12 §6).
    const iJoined = mine.decision === 'JOINED';
    const members: NetworkMemberView[] = row.members
      .filter((member) => member.decision !== 'DECLINED')
      .map((member) => ({
        user:
          activated && iJoined && member.decision === 'JOINED'
            ? this.presenter.toConnectedUser(member.user)
            : this.presenter.toPublicUser(member.user),
        decision: member.decision,
        joinOrder: member.joinOrder,
        isMe: member.userId === me.id,
      }));

    const others = joined
      .filter((member) => member.userId !== me.id)
      .map((member) => this.presenter.fullRealName(member.user) ?? '');

    let action: NetworkDetail['action'] = null;
    if (activated && iJoined && initiator) {
      const initiatorName = this.presenter.fullRealName(initiator.user) ?? '';
      action =
        initiator.userId === me.id
          ? {
              // 시작자의 역할은 "그룹 대화를 열고 초대"까지다. 첫 발언까지 요구하지 않는다(docs/10 §5).
              text: `${initiatorName.split('_')[0]}님, 사내 메신저에서 ${others.join(', ')}님을 초대해 대화를 시작해주세요.`,
              copyText: others.join(', '),
              buttonLabel: '초대했어요',
            }
          : {
              text: `${initiatorName.split('_')[0]}님이 초대할 예정입니다.`,
              copyText: others.join(', '),
              buttonLabel: '초대받았어요',
            };
    }

    return {
      ...summary,
      members,
      // 가장 먼저 참여한 사람이 시작자가 된다(D-18). 참여 전에 알린다.
      wouldBeInitiator: joined.length === 0 && mine.decision === 'PENDING',
      initiatorName: initiator
        ? (this.presenter.fullRealName(initiator.user) ?? '').split('_')[0] ||
          this.presenter.displayName(initiator.user)
        : null,
      action,
      started: Boolean(
        initiator?.userId === me.id ? row.initiatorMarkedAt : mine.markedAt,
      ),
      snapshotNote: '추천 당시 기준',
      // 대화 재료(D-87)는 성립 뒤 참여자에게만. 실명과 같은 조건이다.
      questions:
        activated && iJoined
          ? await this.questions.forNetwork(row.commonInterestIds, row.icebreakerIds)
          : null,
    };
  }

  /**
   * 참여 (docs/10 §5~6).
   * [P-09]명째가 참여하는 즉시 성립한다. 나머지 결정을 기다리지 않는다(D-44).
   */
  async join(me: User, id: string): Promise<NetworkDetail> {
    await this.assertEnabled();

    let activated = false;

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.networkRecommendation.findUnique({
        where: { id },
        include: { members: true },
      });
      if (!row) throw new AppError('NOT_FOUND');
      if (row.status === 'EXPIRED' || row.status === 'DISSOLVED') {
        throw new AppError('ALREADY_HANDLED');
      }
      if (row.expiresAt.getTime() < Date.now()) throw new AppError('ALREADY_HANDLED');

      const mine = row.members.find((member) => member.userId === me.id);
      if (!mine) throw new AppError('NOT_FOUND');
      if (mine.decision === 'JOINED') return;

      const joinedCount = row.members.filter(
        (member) => member.decision === 'JOINED',
      ).length;

      await tx.networkMember.update({
        where: { recommendationId_userId: { recommendationId: id, userId: me.id } },
        data: {
          decision: 'JOINED',
          decidedAt: new Date(),
          joinOrder: joinedCount + 1,
        },
      });

      const required = await this.parameters.get('P-09');
      const nowJoined = joinedCount + 1;

      if (nowJoined === 1) {
        await tx.networkRecommendation.update({
          where: { id },
          data: { initiatorId: me.id },
        });
      }

      if (nowJoined >= required && row.status !== 'ACTIVATED') {
        await tx.networkRecommendation.update({
          where: { id },
          data: {
            status: 'ACTIVATED',
            activatedAt: new Date(),
            // 성립 순간에 뽑아 고정한다(D-87). 누가 언제 열어도 같은 질문이 보인다.
            icebreakerIds: await this.questions.pickIcebreakerIds(),
          },
        });
        activated = true;
        this.logger.log(`네트워크 성립 ${id} (${nowJoined}명)`);
      }
    });

    // 트랜잭션 밖에서 보낸다. 알림은 자기 행을 쓰고 메신저로 나가므로
    // 안에서 부르면 커밋 전 상태를 읽거나 트랜잭션을 길게 잡는다.
    if (activated) await this.notifyActivated(id);

    return this.detail(me, id);
  }

  /**
   * 성립 알림 (docs/10 §5). 참여자 전원에게 보낸다 — 방금 참여를 누른 사람도
   * 포함한다. 그 사람에게는 화면이 이미 성립을 보여주지만, 나중에 다시 찾아올
   * 링크가 알림함에 남아야 한다.
   *
   * **여기서만 실명이 나간다.** 성립된 Network의 참여 멤버는 서로의 실명을 볼 수
   * 있다(design/20 §11). 받는 사람 자신은 목록에서 뺀다.
   */
  private async notifyActivated(id: string): Promise<void> {
    const row = await this.prisma.networkRecommendation.findUnique({
      where: { id },
      include: { members: { include: { user: true } } },
    });
    if (!row) return;

    const joined = row.members.filter((member) => member.decision === 'JOINED');
    const [interests, questions] = await Promise.all([
      this.prisma.interest.findMany({
        where: { id: { in: row.commonInterestIds } },
        select: { name: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.questions.forNetwork(row.commonInterestIds, row.icebreakerIds),
    ]);
    // DM 에는 대화 재료 몇 줄만(D-87). 전부는 성립 화면에 있다.
    const questionLines = this.questions.flatten(questions);

    for (const member of joined) {
      await this.notifications.notify({
        userId: member.userId,
        type: 'NETWORK_ACTIVATED',
        dedupeKey: `network-activated:${id}`,
        payload: {
          memberNames: joined
            .filter((other) => other.userId !== member.userId)
            .map((other) => this.presenter.fullRealName(other.user) ?? '이름 없음'),
          commonInterests: interests.map((interest) => interest.name),
          questions: questionLines,
        },
        targetPath: `/networks?tab=activated&open=${id}`,
      });
    }
  }

  /** 참여 철회. 첫 참여자가 빠지면 다음 참여자가 시작자가 된다(docs/10 §5). */
  async leave(me: User, id: string): Promise<NetworkDetail> {
    await this.assertEnabled();

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.networkRecommendation.findUnique({
        where: { id },
        include: { members: true },
      });
      if (!row) throw new AppError('NOT_FOUND');
      // 성립한 뒤에는 철회가 없다. 메신저 그룹에서 나가면 된다(docs/10 §8).
      if (row.status === 'ACTIVATED') throw new AppError('ALREADY_HANDLED');

      await tx.networkMember.update({
        where: { recommendationId_userId: { recommendationId: id, userId: me.id } },
        data: { decision: 'PENDING', decidedAt: null, joinOrder: null },
      });

      const remaining = row.members
        .filter((member) => member.userId !== me.id && member.decision === 'JOINED')
        .sort((a, b) => (a.joinOrder ?? 0) - (b.joinOrder ?? 0));

      await tx.networkRecommendation.update({
        where: { id },
        data: { initiatorId: remaining[0]?.userId ?? null },
      });
    });

    return this.detail(me, id);
  }

  /** 거절. 나는 멤버에서 빠지고 그룹은 나 없이 성립할 수 있다(docs/10 §5). */
  async decline(me: User, id: string) {
    await this.assertEnabled();

    await this.prisma.networkMember.update({
      where: { recommendationId_userId: { recommendationId: id, userId: me.id } },
      data: { decision: 'DECLINED', decidedAt: new Date() },
    });
    // 나머지에게 통보하지 않는다.
    return { ok: true, notice: '이 네트워크는 나 없이 성립될 수 있습니다.' };
  }

  async markInvited(me: User, id: string) {
    await this.assertEnabled();

    const row = await this.load(id);
    if (row.initiatorId === me.id) {
      await this.prisma.networkRecommendation.update({
        where: { id },
        data: { initiatorMarkedAt: new Date() },
      });
    } else {
      await this.prisma.networkMember.update({
        where: { recommendationId_userId: { recommendationId: id, userId: me.id } },
        data: { markedAt: new Date() },
      });
    }
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────

  private async load(id: string): Promise<Loaded> {
    const row = await this.prisma.networkRecommendation.findUnique({
      where: { id },
      include: { members: { include: { user: true } } },
    });
    if (!row) throw new AppError('NOT_FOUND');
    return row;
  }

  private toSummary(
    row: Loaded,
    me: User,
    required: number,
    interests: Map<string, InterestRef>,
  ): NetworkSummary {
    const active = row.members.filter((member) => member.decision !== 'DECLINED');
    const joinedCount = row.members.filter(
      (member) => member.decision === 'JOINED',
    ).length;
    const mine = row.members.find((member) => member.userId === me.id);

    return {
      id: row.id,
      // 이유가 완전해야 한다. 개수만이 아니라 이름을 전부 보여준다(docs/13 원칙 3).
      reason: `이 ${active.length}명은 관심사 ${row.commonInterestIds.length}개를 모두 공유합니다`,
      commonInterests: row.commonInterestIds
        .map((id) => interests.get(id))
        .filter((ref): ref is InterestRef => Boolean(ref)),
      size: active.length,
      joinedCount,
      requiredCount: required,
      status: row.status,
      myDecision: mine?.decision ?? 'PENDING',
      expiresAt: row.expiresAt.toISOString(),
      daysLeft: Math.max(
        0,
        Math.ceil((row.expiresAt.getTime() - Date.now()) / DAY_MS),
      ),
    };
  }

  private async interestRefs(ids: string[]): Promise<Map<string, InterestRef>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const interests = await this.prisma.interest.findMany({
      where: { id: { in: unique } },
      orderBy: { sortOrder: 'asc' },
    });
    return new Map(
      interests.map((interest) => [
        interest.id,
        { id: interest.id, name: interest.name, categoryId: interest.categoryId },
      ]),
    );
  }
}

import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { FollowUpItem, FollowUpResponseInput } from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserPresenter } from '../users/user.presenter';

/**
 * 후속 확인 (M14, docs/09 §5, FR-11.6).
 *
 * 대화는 서비스 밖에서 일어나므로 이 응답이 **H5를 측정하는 유일한 신호**다(D-08).
 * 그래서 한 번만 묻고(스키마 유니크로 보장), 질문을 하나로 유지한다.
 */
@Injectable()
export class FollowUpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presenter: UserPresenter,
    private readonly notifications: NotificationsService,
  ) {}

  async pending(me: User): Promise<FollowUpItem[]> {
    const checks = await this.prisma.followUpCheck.findMany({
      where: { userId: me.id, respondedAt: null },
      orderBy: { askedAt: 'asc' },
    });
    if (checks.length === 0) return [];

    const connectionIds = checks
      .filter((check) => check.subjectType === 'CONNECTION')
      .map((check) => check.subjectId);

    const connections = await this.prisma.connection.findMany({
      where: { id: { in: connectionIds } },
      include: { userA: true, userB: true },
    });
    const byId = new Map(connections.map((row) => [row.id, row]));

    return checks.flatMap<FollowUpItem>((check) => {
      if (check.subjectType !== 'CONNECTION') {
        return [
          {
            id: check.id,
            subjectType: check.subjectType,
            subjectId: check.subjectId,
            question: '네트워크 대화가 시작되었나요?',
            counterpartName: '',
          },
        ];
      }

      const connection = byId.get(check.subjectId);
      if (!connection) return [];

      const counterpart =
        connection.userAId === me.id ? connection.userB : connection.userA;
      const name = this.presenter.fullRealName(counterpart) ?? '상대';

      return [
        {
          id: check.id,
          subjectType: 'CONNECTION' as const,
          subjectId: check.subjectId,
          question: `${name}님과 대화를 시작하셨나요?`,
          counterpartName: name,
        },
      ];
    });
  }

  async respond(me: User, id: string, input: FollowUpResponseInput) {
    const check = await this.prisma.followUpCheck.findUnique({ where: { id } });
    if (!check || check.userId !== me.id) throw new AppError('NOT_FOUND');
    if (check.respondedAt) throw new AppError('ALREADY_HANDLED');

    // "찾지 못함"이면 상대에게 먼저 연락해달라고 알릴지 묻는다(docs/09 §10).
    const askCounterpart =
      input.started === false &&
      input.reason === 'NOT_FOUND' &&
      Boolean(input.askCounterpart);

    await this.prisma.followUpCheck.update({
      where: { id },
      data: {
        respondedAt: new Date(),
        started: input.started,
        reason: input.started ? null : (input.reason ?? 'OTHER'),
        counterpartAsked: askCounterpart,
      },
    });

    if (askCounterpart && check.subjectType === 'CONNECTION') {
      await this.askCounterpartToReachOut(me, check.subjectId, check.id);
    }

    return { ok: true };
  }

  /**
   * "메신저에서 못 찾았다"에 동의하면 상대에게 먼저 연락해달라고 알린다(docs/09 §10).
   *
   * 여기서 실명을 보내는 것은 **연결된 상대에게만** 가는 알림이기 때문이다.
   * 상대는 이미 내 실명을 볼 수 있는 상태다(design/20 §11).
   */
  private async askCounterpartToReachOut(
    me: User,
    connectionId: string,
    checkId: string,
  ): Promise<void> {
    const connection = await this.prisma.connection.findUnique({
      where: { id: connectionId },
      include: { userA: true, userB: true },
    });
    if (!connection) return;

    const counterpart =
      connection.userAId === me.id ? connection.userB : connection.userA;
    if (counterpart.status !== 'ACTIVE') return;

    await this.notifications.notify({
      userId: counterpart.id,
      type: 'CONNECTION_ASK_COUNTERPART',
      // 한 번만 묻는 확인이라 중복이 나올 수 없지만, 배치가 다시 돌아도 안전하게 둔다.
      dedupeKey: `follow-up-ask:${checkId}`,
      payload: { realName: this.presenter.fullRealName(me) ?? '상대' },
      targetPath: `/connections?connection=${connection.id}`,
    });
  }

  /**
   * 성립 후 [P-18]일에 양쪽에게 하나씩 만든다. 배치가 호출한다(M4, design/20 §7).
   * 유니크 제약이 있어 두 번 돌아도 두 번 묻지 않는다.
   */
  async createForConnection(connectionId: string, userIds: string[]) {
    await this.prisma.followUpCheck.createMany({
      data: userIds.map((userId) => ({
        userId,
        subjectType: 'CONNECTION' as const,
        subjectId: connectionId,
      })),
      skipDuplicates: true,
    });
  }
}

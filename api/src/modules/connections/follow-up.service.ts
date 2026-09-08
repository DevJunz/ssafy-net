import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { FollowUpItem, FollowUpResponseInput } from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../infra/prisma/prisma.service';
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

    // TODO(M4): askCounterpart이면 상대에게 CONNECTION_ASK_COUNTERPART 알림.
    return { ok: true };
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

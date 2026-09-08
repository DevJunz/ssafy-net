import { Injectable } from '@nestjs/common';
import type { Relation } from '@ssafy-net/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ParametersService } from '../parameters/parameters.service';

const DAY_MS = 86_400_000;

const NONE: Relation = { status: 'NONE', requestId: null, reRequestableAt: null };

/**
 * 두 사람 사이의 관계 (docs/09 §11).
 *
 * 가장 조심할 지점: **거절은 보낸 사람에게 노출되지 않는다**(D-07).
 * 거절당한 요청은 `min(거절 시각 + [P-08a], 만료 시각)`이 될 때까지
 * 보낸 사람에게 여전히 "응답 대기"로 보이고, 그 뒤에 "응답 없음"이 된다.
 * 만료와 구분되지 않아야 한다(docs/06 §4).
 *
 * 이것을 배치가 아니라 조회 시점에 계산하는 이유는 design/20 §7에 있다.
 * 상태가 하나 줄고, 표시 시점이 배치 주기만큼 흔들리지 않는다.
 */
@Injectable()
export class RelationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parameters: ParametersService,
  ) {}

  async forUsers(
    meId: string,
    otherIds: string[],
  ): Promise<Map<string, Relation>> {
    const result = new Map<string, Relation>();
    if (otherIds.length === 0) return result;

    const [connections, requests, revealDays, cooldownDays] = await Promise.all([
      this.prisma.connection.findMany({
        where: {
          OR: [
            { userAId: meId, userBId: { in: otherIds } },
            { userBId: meId, userAId: { in: otherIds } },
          ],
        },
        select: { userAId: true, userBId: true },
      }),
      this.prisma.connectionRequest.findMany({
        where: {
          OR: [
            { requesterId: meId, targetId: { in: otherIds } },
            { targetId: meId, requesterId: { in: otherIds } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.parameters.get('P-08a'),
      this.parameters.get('P-07'),
    ]);

    for (const id of otherIds) {
      result.set(id, id === meId ? { ...NONE, status: 'SELF' } : NONE);
    }

    for (const connection of connections) {
      const other = connection.userAId === meId ? connection.userBId : connection.userAId;
      result.set(other, { status: 'CONNECTED', requestId: null, reRequestableAt: null });
    }

    const now = Date.now();

    for (const request of requests) {
      const other = request.requesterId === meId ? request.targetId : request.requesterId;
      if (result.get(other)?.status === 'CONNECTED') continue;

      const incoming = request.targetId === meId;

      if (request.status === 'PENDING') {
        result.set(other, {
          status: incoming ? 'REQUEST_RECEIVED' : 'REQUEST_SENT',
          requestId: request.id,
          reRequestableAt: null,
        });
        continue;
      }

      // 받은 요청을 내가 거절/무시한 것은 상대에게도 나에게도 상태로 남기지 않는다.
      // 상대는 "응답 없음"을 볼 뿐이고, 나는 그 사람에게 다시 요청할 수 있다.
      if (incoming) continue;

      if (request.status === 'REJECTED' || request.status === 'EXPIRED') {
        const terminalAt = request.respondedAt ?? request.expiredAt ?? request.expiresAt;
        const revealAt = Math.min(
          terminalAt.getTime() + revealDays * DAY_MS,
          request.expiresAt.getTime(),
        );

        if (now < revealAt) {
          // 아직 알려줄 때가 아니다. 보낸 사람에게는 대기 중으로 보인다.
          result.set(other, {
            status: 'REQUEST_SENT',
            requestId: request.id,
            reRequestableAt: null,
          });
          continue;
        }

        const reRequestableAt = new Date(terminalAt.getTime() + cooldownDays * DAY_MS);
        if (reRequestableAt.getTime() > now) {
          result.set(other, {
            status: 'NO_RESPONSE',
            requestId: request.id,
            reRequestableAt: reRequestableAt.toISOString(),
          });
        }
        continue;
      }

      // 취소한 요청은 관계를 남기지 않는다. 다만 같은 날 재요청은 막는다(docs/09 §8).
      if (request.status === 'CANCELLED' && request.cancelledAt) {
        const nextDay = new Date(request.cancelledAt);
        nextDay.setHours(24, 0, 0, 0);
        if (nextDay.getTime() > now) {
          result.set(other, {
            status: 'NO_RESPONSE',
            requestId: null,
            reRequestableAt: nextDay.toISOString(),
          });
        }
      }
    }

    return result;
  }

  async forUser(meId: string, otherId: string): Promise<Relation> {
    if (meId === otherId) return { ...NONE, status: 'SELF' };
    const map = await this.forUsers(meId, [otherId]);
    return map.get(otherId) ?? NONE;
  }
}

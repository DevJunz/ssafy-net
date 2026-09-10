import { Injectable } from '@nestjs/common';
import type { Relation } from '@ssafy-net/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';

const NONE: Relation = { status: 'NONE', requestId: null, reRequestableAt: null };

/**
 * 두 사람 사이의 관계 (docs/09 §11, D-83).
 *
 * 거절은 보낸 사람에게 **바로** `REJECTED` 로 보인다(D-07 대체). 보낸 사람이 그 표시를
 * 지우면(`requesterDismissedAt`) 관계는 없던 것이 되고, 지우지 않아도 곧바로 다시 요청할 수 있다.
 * 거절·만료 뒤 재요청 대기(P-07)와 "응답 없음" 표시 지연(P-08a)은 없어졌다.
 *
 * 남는 대기는 하나 — 같은 날 취소한 요청은 그날 안에 다시 보낼 수 없다(docs/09 §8).
 * 이것을 배치가 아니라 조회 시점에 계산하는 이유는 design/20 §7에 있다.
 */
@Injectable()
export class RelationService {
  constructor(private readonly prisma: PrismaService) {}

  async forUsers(
    meId: string,
    otherIds: string[],
  ): Promise<Map<string, Relation>> {
    const result = new Map<string, Relation>();
    if (otherIds.length === 0) return result;

    const [connections, requests] = await Promise.all([
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
    ]);

    for (const id of otherIds) {
      result.set(id, id === meId ? { ...NONE, status: 'SELF' } : NONE);
    }

    for (const connection of connections) {
      const other = connection.userAId === meId ? connection.userBId : connection.userAId;
      result.set(other, { status: 'CONNECTED', requestId: null, reRequestableAt: null });
    }

    const now = Date.now();
    // 최신순이라 한 사람에 대해 처음 정한 상태가 이긴다.
    const decided = new Set<string>();

    for (const request of requests) {
      const other = request.requesterId === meId ? request.targetId : request.requesterId;
      if (result.get(other)?.status === 'CONNECTED' || decided.has(other)) continue;

      const incoming = request.targetId === meId;

      if (request.status === 'PENDING' && request.expiresAt.getTime() > now) {
        result.set(other, {
          status: incoming ? 'REQUEST_RECEIVED' : 'REQUEST_SENT',
          requestId: request.id,
          reRequestableAt: null,
        });
        decided.add(other);
        continue;
      }

      // 받은 요청을 내가 거절/무시한 것은 나에게 상태로 남지 않는다. 나는 그 사람에게 다시 요청할 수 있다.
      if (incoming) continue;
      // 보낸 사람이 표시를 지운 요청은 없던 것이다.
      if (request.requesterDismissedAt) continue;

      if (request.status === 'REJECTED') {
        result.set(other, { status: 'REJECTED', requestId: request.id, reRequestableAt: null });
        decided.add(other);
        continue;
      }

      if (request.status === 'EXPIRED' || request.status === 'PENDING') {
        // 만료(응답 없음). 배치가 아직 EXPIRED 로 바꾸지 않은 PENDING 도 같다.
        result.set(other, { status: 'NO_RESPONSE', requestId: request.id, reRequestableAt: null });
        decided.add(other);
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
          decided.add(other);
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

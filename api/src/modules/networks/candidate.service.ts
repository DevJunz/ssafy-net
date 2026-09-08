import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ParametersService } from '../parameters/parameters.service';

export interface Candidate {
  memberSetHash: string;
  memberIds: string[];
  commonInterestIds: string[];
  size: number;
  commonCount: number;
  rarityScore: number;
  hasNewMember: boolean;
}

/** 이웃이 이만큼을 넘으면 잘라낸다. 인기 관심사 때문에 그래프가 조밀해질 수 있다(R-04). */
const MAX_DEGREE = 60;
/** 신규 가입자 판정(docs/10 §2a 우선순위). */
const NEW_MEMBER_DAYS = 3;

export const memberSetHash = (ids: string[]): string =>
  createHash('sha1').update([...ids].sort().join(',')).digest('hex');

/**
 * Network 후보 생성 (docs/10 §2).
 *
 * "멤버 전원의 교집합이 [P-04]개 이상인 3~6명 그룹"은 조합 탐색이다.
 * 1,000명에서 부분집합을 전수 탐색할 수 없다(C(1000,3)만 1.6억).
 *
 * 단계
 *   1. 쌍 사전 필터(SQL): 공통 [P-04] 이상인 쌍만 남긴다.
 *      전원 교집합이 K 이상이면 그 안의 모든 쌍도 K 이상이므로 답을 잃지 않는다.
 *   2. 쌍에서 시작해 **탐욕적으로 키운다**: 교집합을 가장 적게 깎는 이웃을
 *      하나씩 붙이고, 교집합이 [P-04] 미만이 되면 멈춘다.
 *   3. 극대성: 다른 후보의 부분집합이면 버린다.
 *   4. 전원이 이미 서로 연결된 그룹은 제외한다.
 *
 * design/20 §6.3은 2단계를 Bron–Kerbosch로 적었으나 실제로는 탐욕적 확장을 쓴다.
 * 이유: 인기 관심사가 절반 가까이 겹치는 개발자 조직에서는(R-04) 쌍 그래프가
 * 조밀해져 클리크 열거가 폭발한다. 탐욕적 확장은 모든 극대 그룹을 찾지는 못하지만
 * 결과가 예측 가능하고 시간이 선형에 가깝다. 후보 수가 부족하면 그때 넓힌다.
 */
@Injectable()
export class CandidateService {
  private readonly logger = new Logger(CandidateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parameters: ParametersService,
  ) {}

  async recomputeAll(): Promise<Candidate[]> {
    const startedAt = Date.now();
    const [minCommon, minSize, maxSize] = await Promise.all([
      this.parameters.get('P-04'),
      this.parameters.get('P-05a'),
      this.parameters.get('P-05b'),
    ]);

    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', requestSuspended: false },
      select: { id: true, createdAt: true },
    });
    if (users.length < minSize) return [];

    const interestRows = await this.prisma.userInterest.findMany({
      where: { userId: { in: users.map((u) => u.id) } },
      select: { userId: true, interestId: true },
    });

    const interestsOf = new Map<string, Set<string>>();
    for (const row of interestRows) {
      let set = interestsOf.get(row.userId);
      if (!set) interestsOf.set(row.userId, (set = new Set()));
      set.add(row.interestId);
    }

    const adjacency = await this.pairGraph(minCommon, users.map((u) => u.id));
    const groups = this.grow(adjacency, interestsOf, minCommon, minSize, maxSize);
    const maximal = this.dropSubsets(groups);
    const filtered = await this.dropFullyConnected(maximal);

    const weights = await this.rarityWeights(users.length);
    const newCutoff = Date.now() - NEW_MEMBER_DAYS * 86_400_000;
    const createdAt = new Map(users.map((u) => [u.id, u.createdAt.getTime()]));

    const candidates: Candidate[] = filtered.map((group) => ({
      memberSetHash: memberSetHash(group.memberIds),
      memberIds: group.memberIds,
      commonInterestIds: group.commonInterestIds,
      size: group.memberIds.length,
      commonCount: group.commonInterestIds.length,
      rarityScore: group.commonInterestIds.reduce(
        (sum, id) => sum + (weights.get(id) ?? 0),
        0,
      ),
      hasNewMember: group.memberIds.some(
        (id) => (createdAt.get(id) ?? 0) >= newCutoff,
      ),
    }));

    await this.prisma.$transaction([
      this.prisma.networkCandidate.deleteMany({}),
      this.prisma.networkCandidate.createMany({ data: candidates }),
    ]);

    this.logger.log(
      `후보 ${candidates.length}개 (${Date.now() - startedAt}ms, 사용자 ${users.length}명)`,
    );
    return candidates;
  }

  /**
   * 1단계 — 공통 관심사가 [P-04] 이상인 쌍만 남긴다.
   * 필요조건이므로 여기서 걸러도 답을 잃지 않는다.
   */
  private async pairGraph(
    minCommon: number,
    userIds: string[],
  ): Promise<Map<string, Map<string, number>>> {
    const pairs = await this.prisma.$queryRaw<
      { u1: string; u2: string; c: number }[]
    >(Prisma.sql`
      SELECT a.user_id AS u1, b.user_id AS u2, count(*)::int AS c
      FROM user_interest a
      JOIN user_interest b
        ON a.interest_id = b.interest_id AND a.user_id < b.user_id
      WHERE a.user_id IN (${Prisma.join(userIds)})
        AND b.user_id IN (${Prisma.join(userIds)})
      GROUP BY 1, 2
      HAVING count(*) >= ${minCommon}
    `);

    const adjacency = new Map<string, Map<string, number>>();
    const link = (a: string, b: string, c: number) => {
      let map = adjacency.get(a);
      if (!map) adjacency.set(a, (map = new Map()));
      map.set(b, c);
    };
    for (const pair of pairs) {
      link(pair.u1, pair.u2, pair.c);
      link(pair.u2, pair.u1, pair.c);
    }

    // 차수가 지나치게 큰 노드는 공통 개수가 큰 쪽만 남긴다(design/20 §6.3).
    for (const [id, neighbours] of adjacency) {
      if (neighbours.size <= MAX_DEGREE) continue;
      const kept = [...neighbours.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_DEGREE);
      adjacency.set(id, new Map(kept));
    }

    this.logger.log(`쌍 ${pairs.length}개, 노드 ${adjacency.size}개`);
    return adjacency;
  }

  /** 2단계 — 쌍에서 시작해 교집합을 지키며 탐욕적으로 키운다. */
  private grow(
    adjacency: Map<string, Map<string, number>>,
    interestsOf: Map<string, Set<string>>,
    minCommon: number,
    minSize: number,
    maxSize: number,
  ): { memberIds: string[]; commonInterestIds: string[] }[] {
    const seen = new Set<string>();
    const groups: { memberIds: string[]; commonInterestIds: string[] }[] = [];

    for (const [seed, neighbours] of adjacency) {
      for (const partner of neighbours.keys()) {
        if (seed > partner) continue; // 각 쌍을 한 번만 본다

        const members = [seed, partner];
        let intersection = this.intersect(
          interestsOf.get(seed),
          interestsOf.get(partner),
        );
        if (intersection.size < minCommon) continue;

        while (members.length < maxSize) {
          // 모든 멤버와 이웃인 후보만 본다.
          const shared = [...(adjacency.get(members[0])?.keys() ?? [])].filter(
            (id) =>
              !members.includes(id) &&
              members.every((member) => adjacency.get(member)?.has(id)),
          );

          let best: { id: string; next: Set<string> } | null = null;
          for (const id of shared) {
            const next = this.intersect(intersection, interestsOf.get(id));
            if (next.size < minCommon) continue;
            if (!best || next.size > best.next.size) best = { id, next };
          }
          if (!best) break;

          members.push(best.id);
          intersection = best.next;
        }

        if (members.length < minSize) continue;

        const hash = memberSetHash(members);
        if (seen.has(hash)) continue;
        seen.add(hash);

        groups.push({
          memberIds: [...members].sort(),
          commonInterestIds: [...intersection].sort(),
        });
      }
    }

    return groups;
  }

  private intersect(
    a: Set<string> | undefined,
    b: Set<string> | undefined,
  ): Set<string> {
    if (!a || !b) return new Set();
    const [small, large] = a.size <= b.size ? [a, b] : [b, a];
    return new Set([...small].filter((id) => large.has(id)));
  }

  /** 3단계 — 다른 후보의 부분집합이면 버린다(docs/10 §2). */
  private dropSubsets(
    groups: { memberIds: string[]; commonInterestIds: string[] }[],
  ) {
    const sorted = [...groups].sort(
      (a, b) => b.memberIds.length - a.memberIds.length,
    );
    const kept: typeof sorted = [];

    for (const group of sorted) {
      const members = new Set(group.memberIds);
      const isSubset = kept.some(
        (other) =>
          other.memberIds.length > group.memberIds.length &&
          group.memberIds.every((id) => other.memberIds.includes(id)) &&
          members.size < other.memberIds.length,
      );
      if (!isSubset) kept.push(group);
    }

    return kept;
  }

  /** 4단계 — 전원이 이미 서로 연결된 그룹은 추천할 이유가 없다(docs/10 §2). */
  private async dropFullyConnected(
    groups: { memberIds: string[]; commonInterestIds: string[] }[],
  ) {
    if (groups.length === 0) return groups;

    const connections = await this.prisma.connection.findMany({
      select: { userAId: true, userBId: true },
    });
    const connected = new Set(
      connections.map((c) => `${c.userAId}|${c.userBId}`),
    );
    const isConnected = (a: string, b: string) =>
      connected.has(a < b ? `${a}|${b}` : `${b}|${a}`);

    return groups.filter((group) => {
      for (let i = 0; i < group.memberIds.length; i += 1) {
        for (let j = i + 1; j < group.memberIds.length; j += 1) {
          if (!isConnected(group.memberIds[i], group.memberIds[j])) return true;
        }
      }
      return false;
    });
  }

  /** 희소성 가중. 정렬에만 쓰고 응답에 넣지 않는다(docs/13 원칙 2). */
  private async rarityWeights(activeUsers: number): Promise<Map<string, number>> {
    const interests = await this.prisma.interest.findMany({
      select: { id: true, holderCount: true },
    });
    return new Map(
      interests.map((interest) => [
        interest.id,
        Math.log(1 + activeUsers / Math.max(1, interest.holderCount)),
      ]),
    );
  }

  /**
   * 데이터 게이트 (docs/10 §4).
   * 온보딩 완료자 1인당 평균 후보 수가 1 이상이면 통과다.
   */
  async evaluateGate() {
    const [activeUsers, candidates] = await Promise.all([
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.networkCandidate.findMany({ select: { memberIds: true } }),
    ]);

    const slots = candidates.reduce((sum, c) => sum + c.memberIds.length, 0);
    const perUser = activeUsers === 0 ? 0 : slots / activeUsers;

    return {
      activeUsers,
      candidates: candidates.length,
      perUser: Number(perUser.toFixed(2)),
      passes: perUser >= 1,
    };
  }
}

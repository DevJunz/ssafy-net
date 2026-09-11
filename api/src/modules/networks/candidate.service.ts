import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { OpsNetworkPreview, OpsNetworkPreviewRow } from '@ssafy-net/shared';
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
/** 미리보기에서 "인기 관심사"로 세는 보유율(docs/10 §3 의 조정 데이터가 쓰는 30%). */
const POPULAR_RATIO = 0.3;
/** 미리보기가 보여 주는 P-04 후보값. 지금 값이 이 밖이면 한 줄을 더 붙인다. */
const PREVIEW_THRESHOLDS = [3, 4, 5, 6];

type Group = { memberIds: string[]; commonInterestIds: string[] };

/** 한 번 읽어 여러 기준값에 돌려 쓰는 재료. 미리보기가 SQL 을 기준값마다 다시 치지 않게 한다. */
interface Snapshot {
  users: { id: string; createdAt: Date }[];
  interestsOf: Map<string, Set<string>>;
  /** ACTIVE 사용자 기준 실제 보유 수. 비정규화된 holderCount 가 아니라 여기서 센 값이다 */
  holders: Map<string, number>;
}

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

  /**
   * 재계산은 한 번에 하나만 돈다.
   *
   * `recomputeAll` 은 `network_candidate` 를 통째로 비우고 다시 채운다. 배치(09·18시)와
   * 온보딩 즉시 노출(docs/10 §2a)과 `/ops` 버튼이 같은 순간에 겹칠 수 있고, 같은 표를
   * 동시에 지우는 트랜잭션 둘은 교착이나 직렬화 오류로 끝난다. 줄을 세우면 각 호출이
   * **자기 차례에 최신 데이터를 보고** 돌아 결과도 정확해진다 — 앞 호출에 묻어가면
   * 방금 온보딩한 사람이 그 계산에 안 들어 있을 수 있다.
   */
  private queue: Promise<unknown> = Promise.resolve();

  async recomputeAll(): Promise<Candidate[]> {
    const run = this.queue.then(
      () => this.runRecompute(),
      () => this.runRecompute(),
    );
    // 앞사람이 실패해도 줄은 계속 움직여야 한다.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async runRecompute(): Promise<Candidate[]> {
    const startedAt = Date.now();
    const [minCommon, minSize, maxSize] = await Promise.all([
      this.parameters.get('P-04'),
      this.parameters.get('P-05a'),
      this.parameters.get('P-05b'),
    ]);

    const { users, interestsOf } = await this.snapshot();
    if (users.length < minSize) return [];

    const pairs = await this.loadPairs(minCommon, users.map((u) => u.id));
    const adjacency = this.buildAdjacency(pairs, minCommon);
    this.logger.log(`쌍 ${pairs.length}개, 노드 ${adjacency.size}개`);

    const groups = this.grow(adjacency, interestsOf, minCommon, minSize, maxSize);
    const maximal = this.dropSubsets(groups);
    const filtered = this.dropFullyConnected(maximal, await this.connectedPairs());

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
   * 사용자와 관심사를 한 번만 읽는다. 미리보기는 기준값 네 개를 돌려 보므로
   * 여기서 읽은 것을 그대로 재사용한다.
   *
   * 속성(층)은 공통 관심사가 아니다(D-72). 같은 층 사람끼리 묶이는 것은 추천의 목적이 아니다.
   */
  private async snapshot(): Promise<Snapshot> {
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', requestSuspended: false },
      select: { id: true, createdAt: true },
    });

    const interestRows = users.length
      ? await this.prisma.userInterest.findMany({
          where: {
            userId: { in: users.map((u) => u.id) },
            interest: { category: { kind: 'INTEREST' } },
          },
          select: { userId: true, interestId: true },
        })
      : [];

    const interestsOf = new Map<string, Set<string>>();
    const holders = new Map<string, number>();
    for (const row of interestRows) {
      let set = interestsOf.get(row.userId);
      if (!set) interestsOf.set(row.userId, (set = new Set()));
      set.add(row.interestId);
      holders.set(row.interestId, (holders.get(row.interestId) ?? 0) + 1);
    }

    return { users, interestsOf, holders };
  }

  /**
   * 1단계 — 공통 관심사가 [P-04] 이상인 쌍만 SQL 로 남긴다.
   * 필요조건이므로 여기서 걸러도 답을 잃지 않는다.
   *
   * 미리보기는 **가장 낮은 기준값으로 한 번만** 부르고 나머지는 메모리에서 걸러 쓴다.
   */
  private loadPairs(
    minCommon: number,
    userIds: string[],
  ): Promise<{ u1: string; u2: string; c: number }[]> {
    if (userIds.length < 2) return Promise.resolve([]);
    return this.prisma.$queryRaw<{ u1: string; u2: string; c: number }[]>(Prisma.sql`
      SELECT a.user_id AS u1, b.user_id AS u2, count(*)::int AS c
      FROM user_interest a
      JOIN user_interest b
        ON a.interest_id = b.interest_id AND a.user_id < b.user_id
      JOIN interest i  ON i.id = a.interest_id
      JOIN category c  ON c.id = i.category_id AND c.kind = 'INTEREST'
      WHERE a.user_id IN (${Prisma.join(userIds)})
        AND b.user_id IN (${Prisma.join(userIds)})
      GROUP BY 1, 2
      HAVING count(*) >= ${minCommon}
    `);
  }

  /** 쌍 목록에서 기준값 하나짜리 인접 그래프를 만든다. */
  private buildAdjacency(
    pairs: { u1: string; u2: string; c: number }[],
    minCommon: number,
  ): Map<string, Map<string, number>> {
    const adjacency = new Map<string, Map<string, number>>();
    const link = (a: string, b: string, c: number) => {
      let map = adjacency.get(a);
      if (!map) adjacency.set(a, (map = new Map()));
      map.set(b, c);
    };
    for (const pair of pairs) {
      if (pair.c < minCommon) continue;
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

    return adjacency;
  }

  /** 2단계 — 쌍에서 시작해 교집합을 지키며 탐욕적으로 키운다. */
  private grow(
    adjacency: Map<string, Map<string, number>>,
    interestsOf: Map<string, Set<string>>,
    minCommon: number,
    minSize: number,
    maxSize: number,
  ): Group[] {
    const seen = new Set<string>();
    const groups: Group[] = [];

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

  /**
   * 3단계 — 다른 후보의 부분집합이면 버린다(docs/10 §2).
   *
   * 큰 것부터 보면서, 이미 남긴 것 중에 나를 통째로 품는 것이 있으면 버린다.
   * 후보 전부와 견주지 않고 **내 첫 멤버를 가진 것들**하고만 견준다 — 나를 품으려면
   * 내 멤버를 전부 가져야 하고, 거기엔 첫 멤버도 들어 있다. 결과는 같고 비교 횟수만 준다.
   * 기준값을 3까지 내리면 후보가 수만 개가 되므로 여기가 먼저 느려진다.
   */
  private dropSubsets(groups: Group[]): Group[] {
    const sorted = [...groups].sort(
      (a, b) => b.memberIds.length - a.memberIds.length,
    );

    const kept: Group[] = [];
    const keptSets = new Map<Group, Set<string>>();
    // 첫 멤버 → 그 멤버를 가진 채 남은 후보들
    const byFirstMember = new Map<string, Group[]>();

    for (const group of sorted) {
      const bucket = byFirstMember.get(group.memberIds[0]) ?? [];
      const isSubset = bucket.some((other) => {
        if (other.memberIds.length <= group.memberIds.length) return false;
        const members = keptSets.get(other);
        return group.memberIds.every((id) => members?.has(id));
      });
      if (isSubset) continue;

      kept.push(group);
      keptSets.set(group, new Set(group.memberIds));
      for (const id of group.memberIds) {
        const list = byFirstMember.get(id);
        if (list) list.push(group);
        else byFirstMember.set(id, [group]);
      }
    }

    return kept;
  }

  /** 이미 성립한 1:1 연결. `a|b`(정렬된 순서)로 담는다. */
  private async connectedPairs(): Promise<Set<string>> {
    const connections = await this.prisma.connection.findMany({
      select: { userAId: true, userBId: true },
    });
    return new Set(
      connections.map((c) =>
        c.userAId < c.userBId
          ? `${c.userAId}|${c.userBId}`
          : `${c.userBId}|${c.userAId}`,
      ),
    );
  }

  /** 4단계 — 전원이 이미 서로 연결된 그룹은 추천할 이유가 없다(docs/10 §2). */
  private dropFullyConnected(groups: Group[], connected: Set<string>): Group[] {
    if (connected.size === 0) return groups;

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
   * 기준값(P-04)을 바꾸기 전에 **지금 데이터로** 결과를 미리 본다(D-91).
   *
   * 저장하는 것이 없다 — `network_candidate` 는 건드리지 않는다. 재계산과 같은 파이프라인을
   * 기준값만 갈아 끼워 돌린다. SQL 은 가장 낮은 기준값으로 한 번만 치고 나머지 줄은
   * 그 결과를 메모리에서 걸러 쓴다.
   *
   * "인기뿐" 비율이 이 화면의 핵심이다. 후보 수만 보면 기준값을 낮출수록 좋아 보이지만,
   * 낮출수록 그 후보는 인기 관심사만으로 묶인 것이 된다(docs/10 §3, §4).
   */
  async preview(): Promise<OpsNetworkPreview> {
    const startedAt = Date.now();
    const [current, minSize, maxSize] = await Promise.all([
      this.parameters.get('P-04'),
      this.parameters.get('P-05a'),
      this.parameters.get('P-05b'),
    ]);

    const thresholds = [...new Set([...PREVIEW_THRESHOLDS, current])].sort(
      (a, b) => a - b,
    );

    const { users, interestsOf, holders } = await this.snapshot();
    const activeUsers = users.length;

    // 보유율 30% 이상이면 인기 관심사다. 이름까지 돌려줘 무엇을 인기로 봤는지 보이게 한다.
    const popularIds = new Set<string>();
    for (const [id, count] of holders) {
      if (activeUsers > 0 && count / activeUsers >= POPULAR_RATIO) popularIds.add(id);
    }
    const popularNames = popularIds.size
      ? (
          await this.prisma.interest.findMany({
            where: { id: { in: [...popularIds] } },
            select: { name: true },
            orderBy: { holderCount: 'desc' },
          })
        ).map((interest) => interest.name)
      : [];

    const empty = (minCommon: number): OpsNetworkPreviewRow => ({
      minCommon,
      candidates: 0,
      coveredUsers: 0,
      perUser: 0,
      popularOnly: null,
      current: minCommon === current,
    });

    if (activeUsers < minSize) {
      return {
        activeUsers,
        popularThreshold: POPULAR_RATIO,
        popularInterests: popularNames,
        rows: thresholds.map(empty),
        computeMs: Date.now() - startedAt,
      };
    }

    const pairs = await this.loadPairs(
      Math.min(...thresholds),
      users.map((u) => u.id),
    );
    const connected = await this.connectedPairs();

    const rows = thresholds.map((minCommon) => {
      const adjacency = this.buildAdjacency(pairs, minCommon);
      const groups = this.dropFullyConnected(
        this.dropSubsets(this.grow(adjacency, interestsOf, minCommon, minSize, maxSize)),
        connected,
      );

      const covered = new Set<string>();
      let popularOnly = 0;
      let slots = 0;
      for (const group of groups) {
        for (const id of group.memberIds) covered.add(id);
        slots += group.memberIds.length;
        if (group.commonInterestIds.every((id) => popularIds.has(id))) popularOnly += 1;
      }

      return {
        minCommon,
        candidates: groups.length,
        coveredUsers: covered.size,
        perUser: Number((slots / activeUsers).toFixed(2)),
        popularOnly: groups.length === 0 ? null : popularOnly / groups.length,
        current: minCommon === current,
      };
    });

    const computeMs = Date.now() - startedAt;
    this.logger.log(
      `미리보기 ${thresholds.join('·')} — ${rows.map((r) => `${r.minCommon}:${r.candidates}`).join(' ')} (${computeMs}ms)`,
    );

    return {
      activeUsers,
      popularThreshold: POPULAR_RATIO,
      popularInterests: popularNames,
      rows,
      computeMs,
    };
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

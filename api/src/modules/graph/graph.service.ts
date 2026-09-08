import { Injectable } from '@nestjs/common';
import type { Interest, User } from '@prisma/client';
import type {
  GraphInterestNode,
  GraphLink,
  GraphNode,
  GraphPersonNode,
  GraphResponse,
} from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RelationService } from '../connections/relation.service';
import { ParametersService } from '../parameters/parameters.service';
import {
  CommonInterestsService,
  type CommonInterestRow,
} from '../recommendation/common-interests.service';
import { UserPresenter } from '../users/user.presenter';

/** 계층 2의 보정 기준: 내 관심사마다 최소 이만큼은 사람이 보여야 한다(docs/06 §1.1). */
const MIN_HOLDERS_PER_INTEREST = 2;

/**
 * 나 중심 부분 그래프 (docs/06 §1.1, design/20 §6.1).
 *
 * 전체 조직을 그리지 않는다. 1,000명을 한 화면에 그리는 것은 불가능하고(R-02),
 * 앵커에서 두 단계까지만 보여준다.
 */
@Injectable()
export class GraphService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parameters: ParametersService,
    private readonly common: CommonInterestsService,
    private readonly relations: RelationService,
    private readonly presenter: UserPresenter,
  ) {}

  // ─────────────────────────────────────────────────────────
  // 앵커 = 나 (기본)
  // ─────────────────────────────────────────────────────────

  async meAnchored(me: User): Promise<GraphResponse> {
    const [myInterestIds, activeUsers, peopleLimit, adjacentLimit] =
      await Promise.all([
        this.common.myInterestIds(me.id),
        this.common.activeUserCount(),
        this.parameters.get('P-13'),
        this.parameters.get('P-14'),
      ]);

    const overlapping = this.common.sort(
      await this.common.findOverlapping(me.id, myInterestIds, activeUsers),
    );

    const selected = this.selectWithCoverage(
      overlapping,
      myInterestIds,
      peopleLimit,
    );

    const { nodes, links, adjacentTruncated } = await this.buildAround(
      me,
      selected.map((row) => row.userId),
      new Map(selected.map((row) => [row.userId, row.commonCount])),
      myInterestIds,
      myInterestIds,
      adjacentLimit,
    );

    return {
      anchor: { type: 'ME' },
      nodes,
      links,
      truncated: {
        people: overlapping.length - selected.length,
        interests: adjacentTruncated,
      },
    };
  }

  /**
   * 계층 2 선정 (design/20 §6.1).
   *
   * 상위 [P-13]명을 뽑은 뒤, 내 관심사 중 표시된 사람이 2명 미만인 것을 채운다.
   * 보정이 상한보다 우선한다 — 관심사 하나에 아무도 안 보이면
   * "이 관심사를 왜 골랐지"가 되어 그래프의 설명력이 무너진다.
   */
  private selectWithCoverage(
    sorted: CommonInterestRow[],
    myInterestIds: string[],
    limit: number,
  ): CommonInterestRow[] {
    const selected = sorted.slice(0, limit);
    const selectedIds = new Set(selected.map((row) => row.userId));

    const coverage = () => {
      const counts = new Map<string, number>(
        myInterestIds.map((id) => [id, 0]),
      );
      for (const row of selected) {
        for (const interestId of row.commonInterestIds) {
          counts.set(interestId, (counts.get(interestId) ?? 0) + 1);
        }
      }
      return counts;
    };

    // 부족한 관심사를 순위 순으로 채운다.
    for (const [interestId, count] of coverage()) {
      let need = MIN_HOLDERS_PER_INTEREST - count;
      if (need <= 0) continue;

      for (const row of sorted) {
        if (need <= 0) break;
        if (selectedIds.has(row.userId)) continue;
        if (!row.commonInterestIds.includes(interestId)) continue;
        selected.push(row);
        selectedIds.add(row.userId);
        need -= 1;
      }
    }

    // 상한을 넘겼으면, 빼도 어떤 관심사의 커버리지가 무너지지 않는 사람부터
    // 순위가 낮은 쪽으로 뺀다.
    while (selected.length > limit) {
      const counts = coverage();
      const removableIndex = [...selected]
        .map((row, index) => ({ row, index }))
        .reverse()
        .find(({ row }) =>
          row.commonInterestIds.every(
            (interestId) =>
              (counts.get(interestId) ?? 0) > MIN_HOLDERS_PER_INTEREST,
          ),
        );

      if (!removableIndex) break; // 더 뺄 수 없다. 보정이 상한보다 우선한다.
      selected.splice(removableIndex.index, 1);
      selectedIds.delete(removableIndex.row.userId);
    }

    return selected;
  }

  // ─────────────────────────────────────────────────────────
  // 앵커 = 관심사 (재중심)
  // ─────────────────────────────────────────────────────────

  async interestAnchored(me: User, interestId: string): Promise<GraphResponse> {
    const interest = await this.prisma.interest.findUnique({
      where: { id: interestId },
    });
    if (!interest) throw new AppError('NOT_FOUND');

    const [myInterestIds, activeUsers, peopleLimit, adjacentLimit] =
      await Promise.all([
        this.common.myInterestIds(me.id),
        this.common.activeUserCount(),
        this.parameters.get('P-13'),
        this.parameters.get('P-14'),
      ]);

    const overlapping = await this.common.findOverlapping(
      me.id,
      myInterestIds,
      activeUsers,
    );
    const overlapByUser = new Map(
      overlapping.map((row) => [row.userId, row]),
    );

    const holders = await this.prisma.userInterest.findMany({
      where: {
        interestId,
        user: { status: 'ACTIVE' },
        NOT: { userId: me.id },
      },
      select: { userId: true },
    });

    // 나와 공통 관심사가 많은 순. 겹치지 않는 사람도 뒤에 남는다.
    const ranked = this.common.sort(
      holders.map(
        (holder) =>
          overlapByUser.get(holder.userId) ?? {
            userId: holder.userId,
            commonCount: 0,
            rarity: 0,
            commonInterestIds: [],
            createdAt: new Date(0),
          },
      ),
    );

    const selected = ranked.slice(0, peopleLimit);

    // 앵커가 관심사여도 나는 항상 그래프에 남는다. 나와의 관계를 잃지 않기 위해서다.
    const { nodes, links, adjacentTruncated } = await this.buildAround(
      me,
      selected.map((row) => row.userId),
      new Map(selected.map((row) => [row.userId, row.commonCount])),
      myInterestIds,
      [...new Set([interestId, ...myInterestIds])],
      adjacentLimit,
    );

    return {
      anchor: { type: 'INTEREST', interestId, name: interest.name },
      nodes,
      links,
      truncated: {
        people: ranked.length - selected.length,
        interests: adjacentTruncated,
      },
    };
  }

  // ─────────────────────────────────────────────────────────
  // Similar 모드 — 기본 그래프 위에 겹쳐지는 상태다(docs/05 §1)
  // ─────────────────────────────────────────────────────────

  async similarMode(me: User): Promise<GraphResponse> {
    const [myInterestIds, activeUsers, minCommon, edgeLimit] =
      await Promise.all([
        this.common.myInterestIds(me.id),
        this.common.activeUserCount(),
        this.parameters.get('P-03'),
        this.parameters.get('P-15'),
      ]);

    const overlapping = this.common
      .sort(await this.common.findOverlapping(me.id, myInterestIds, activeUsers))
      .filter((row) => row.commonCount >= minCommon);

    const top = overlapping.slice(0, edgeLimit);
    const users = await this.loadUsers(top.map((row) => row.userId));
    const relations = await this.relations.forUsers(
      me.id,
      top.map((row) => row.userId),
    );

    const nodes: GraphNode[] = [this.meNode(me)];
    const links: GraphLink[] = [];

    for (const row of top) {
      const user = users.get(row.userId);
      if (!user) continue;

      nodes.push(this.personNode(user, row.commonCount, relations.get(user.id)?.status));
      links.push({
        source: me.id,
        target: user.id,
        kind: 'SIMILARITY',
        commonCount: row.commonCount,
        // 개수만이 아니라 이름을 전부 준다(docs/13 원칙 3, FR-8.2).
        commonInterestIds: row.commonInterestIds,
      });
    }

    return {
      anchor: { type: 'ME' },
      nodes,
      links,
      truncated: { people: overlapping.length - top.length, interests: 0 },
    };
  }

  // ─────────────────────────────────────────────────────────
  // 공통 조립
  // ─────────────────────────────────────────────────────────

  /**
   * 사람 목록이 정해진 뒤의 조립.
   * `baseInterestIds`는 처음부터 그래프에 있는 관심사(내 관심사, 앵커 관심사)이고,
   * 나머지는 표시된 사람들이 가진 것 중 상위 [P-14]개를 인접 관심사로 붙인다.
   */
  private async buildAround(
    me: User,
    personIds: string[],
    commonCountByUser: Map<string, number>,
    myInterestIds: string[],
    baseInterestIds: string[],
    adjacentLimit: number,
  ): Promise<{
    nodes: GraphNode[];
    links: GraphLink[];
    adjacentTruncated: number;
  }> {
    const [users, relations, personInterests] = await Promise.all([
      this.loadUsers(personIds),
      this.relations.forUsers(me.id, personIds),
      personIds.length
        ? this.prisma.userInterest.findMany({
            where: { userId: { in: personIds } },
            select: { userId: true, interestId: true },
          })
        : Promise.resolve([]),
    ]);

    // 계층 3: 표시된 사람들이 가진, 그래프에 아직 없는 관심사.
    const baseSet = new Set(baseInterestIds);
    const adjacentCounts = new Map<string, number>();
    for (const row of personInterests) {
      if (baseSet.has(row.interestId)) continue;
      adjacentCounts.set(
        row.interestId,
        (adjacentCounts.get(row.interestId) ?? 0) + 1,
      );
    }

    const adjacentRanked = [...adjacentCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    );
    const adjacentIds = adjacentRanked
      .slice(0, adjacentLimit)
      .map(([id]) => id);

    const interests = await this.loadInterests([
      ...baseInterestIds,
      ...adjacentIds,
    ]);
    const mySet = new Set(myInterestIds);
    const visibleInterests = new Set([...baseInterestIds, ...adjacentIds]);

    const nodes: GraphNode[] = [this.meNode(me)];
    const links: GraphLink[] = [];

    for (const interestId of [...baseInterestIds, ...adjacentIds]) {
      const interest = interests.get(interestId);
      if (!interest) continue;
      nodes.push(
        this.interestNode(
          interest,
          mySet.has(interestId),
          adjacentCounts.get(interestId),
        ),
      );
    }

    // 나와 내 관심사를 잇는 선.
    for (const interestId of myInterestIds) {
      if (!visibleInterests.has(interestId)) continue;
      links.push({ source: me.id, target: interestId, kind: 'HAS_INTEREST' });
    }

    for (const personId of personIds) {
      const user = users.get(personId);
      if (!user) continue;
      nodes.push(
        this.personNode(
          user,
          commonCountByUser.get(personId) ?? 0,
          relations.get(personId)?.status,
        ),
      );
    }

    // 사람 노드는 **표시된 관심사에만** 선으로 연결된다(docs/06 §1.1).
    // 표시되지 않은 관심사와의 관계는 그리지 않는다.
    for (const row of personInterests) {
      if (!visibleInterests.has(row.interestId)) continue;
      links.push({
        source: row.userId,
        target: row.interestId,
        kind: 'HAS_INTEREST',
      });
    }

    return {
      nodes,
      links,
      adjacentTruncated: Math.max(0, adjacentRanked.length - adjacentIds.length),
    };
  }

  private async loadUsers(ids: string[]): Promise<Map<string, User>> {
    if (ids.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } } });
    return new Map(users.map((user) => [user.id, user]));
  }

  private async loadInterests(ids: string[]): Promise<Map<string, Interest>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const interests = await this.prisma.interest.findMany({
      where: { id: { in: unique } },
    });
    return new Map(interests.map((interest) => [interest.id, interest]));
  }

  private meNode(me: User): GraphPersonNode {
    return {
      id: me.id,
      kind: 'ME',
      displayName: this.presenter.displayName(me),
      displayNameType: me.displayNameType,
      commonCount: 0,
      relation: 'SELF',
    };
  }

  private personNode(
    user: User,
    commonCount: number,
    relation: GraphPersonNode['relation'] = 'NONE',
  ): GraphPersonNode {
    return {
      id: user.id,
      kind: 'PERSON',
      displayName: this.presenter.displayName(user),
      displayNameType: user.displayNameType,
      commonCount,
      relation,
    };
  }

  private interestNode(
    interest: Interest,
    mine: boolean,
    holdersInGraph?: number,
  ): GraphInterestNode {
    return {
      id: interest.id,
      kind: 'INTEREST',
      name: interest.name,
      categoryId: interest.categoryId,
      mine,
      holderCount: interest.holderCount,
      ...(mine ? {} : { adjacent: true, holdersInGraph }),
    };
  }
}

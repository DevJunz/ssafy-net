import { Injectable, Logger } from '@nestjs/common';
import type { Interest, User } from '@prisma/client';
import type {
  CreateInterestInput,
  CreatedInterest,
  InterestCatalog,
  InterestDetail,
  InterestPersonItem,
  InterestRef,
  SimilarInterest,
} from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { MattermostService } from '../../infra/mattermost/mattermost.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RelationService } from '../connections/relation.service';
import { ParametersService } from '../parameters/parameters.service';
import { PostsService } from '../posts/posts.service';
import { CommonInterestsService } from '../recommendation/common-interests.service';
import { UserPresenter } from '../users/user.presenter';
import { findSimilarInterests } from './similarity';

/** 관심사 상세의 사람 목록은 한 번에 이만큼 보여주고 "더 보기"로 잇는다(docs/06 §3.3). */
const PEOPLE_PAGE_SIZE = 20;

/**
 * 한 사람이 하루에 직접 만들 수 있는 관심사 수 (D-74).
 * 사용이 2주에 집중되므로 목록이 하루 만에 흐트러지지 않게 하는 장치다.
 */
const CREATE_PER_DAY = 3;

type InterestWithCategory = Interest & {
  category: { id: string; name: string; kind: 'INTEREST' | 'ATTRIBUTE' };
};

@Injectable()
export class InterestsService {
  private readonly logger = new Logger(InterestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parameters: ParametersService,
    private readonly common: CommonInterestsService,
    private readonly relations: RelationService,
    private readonly presenter: UserPresenter,
    private readonly posts: PostsService,
    private readonly mattermost: MattermostService,
  ) {}

  async refsFor(userId: string): Promise<InterestRef[]> {
    const rows = await this.prisma.userInterest.findMany({
      where: { userId },
      include: { interest: true },
      orderBy: { interest: { sortOrder: 'asc' } },
    });

    return rows.map((row) => ({
      id: row.interest.id,
      name: row.interest.name,
      categoryId: row.interest.categoryId,
    }));
  }

  /**
   * 온보딩과 관심사 수정이 같은 화면을 쓴다(D-24). 목록도 같은 응답이다.
   * 숨겨진 관심사는 이미 가진 사람에게만 보인다(docs/08 §5).
   * selectedCount는 이야깃거리(INTEREST)만 센다. 층 같은 속성은 개수에 들어가지 않는다(D-72).
   */
  async catalog(userId: string): Promise<InterestCatalog> {
    const [categories, mine, min, max] = await Promise.all([
      this.prisma.category.findMany({
        orderBy: { sortOrder: 'asc' },
        include: { interests: { orderBy: { sortOrder: 'asc' } } },
      }),
      this.prisma.userInterest.findMany({
        where: { userId },
        select: { interestId: true },
      }),
      this.parameters.get('P-01'),
      this.parameters.get('P-02'),
    ]);

    const mineIds = new Set(mine.map((row) => row.interestId));
    let selectedCount = 0;

    const mapped = categories.map((category) => {
      const interests = category.interests
        .filter(
          (interest) =>
            interest.status === 'ACTIVE' || mineIds.has(interest.id),
        )
        .map((interest) => ({
          id: interest.id,
          name: interest.name,
          aliases: interest.aliases,
          // "여기 고르면 누가 있을지"의 힌트다(docs/06 §3.1.4).
          holderCount: interest.holderCount,
          mine: mineIds.has(interest.id),
          status: interest.status,
        }));

      if (category.kind === 'INTEREST') {
        selectedCount += interests.filter((interest) => interest.mine).length;
      }

      return {
        id: category.id,
        name: category.name,
        kind: category.kind,
        interests,
      };
    });

    return { categories: mapped, selectedCount, min, max };
  }

  /**
   * 관심사 상세 (docs/06 §3.3).
   *
   * 사람 목록은 **나와 공통 관심사가 많은 순**이다. 누구를 볼지 판단을 돕는
   * 유일한 기준이고, 그 기준을 화면에 적는다(docs/13 원칙 4).
   */
  async detail(me: User, interestId: string): Promise<InterestDetail> {
    const interest = await this.prisma.interest.findUnique({
      where: { id: interestId },
      include: { category: true },
    });
    if (!interest) throw new AppError('NOT_FOUND');

    const mine = Boolean(
      await this.prisma.userInterest.findUnique({
        where: { userId_interestId: { userId: me.id, interestId } },
        select: { userId: true },
      }),
    );

    const [{ people, total }, posts] = await Promise.all([
      this.people(me, interestId, 0),
      this.posts.byInterest(interestId),
    ]);

    return {
      id: interest.id,
      name: interest.name,
      categoryId: interest.categoryId,
      categoryName: interest.category.name,
      holderCount: interest.holderCount,
      mine,
      // 관심사를 가진 사람만 글을 쓸 수 있다(FR-6.1). 층 같은 속성에는 글을 두지 않는다(D-72).
      canPost: mine && interest.category.kind === 'INTEREST',
      peopleTotal: total,
      people,
      posts,
    };
  }

  /** 관심사 보유자 목록. 나와 공통 많은 순, 페이지 단위로 이어 본다. */
  async people(
    me: User,
    interestId: string,
    offset: number,
  ): Promise<{ people: InterestPersonItem[]; total: number }> {
    const [myInterestIds, activeUsers] = await Promise.all([
      this.common.myInterestIds(me.id),
      this.common.activeUserCount(),
    ]);

    const overlapping = await this.common.findOverlapping(
      me.id,
      myInterestIds,
      activeUsers,
    );
    const overlapByUser = new Map(overlapping.map((row) => [row.userId, row]));

    const holders = await this.prisma.userInterest.findMany({
      where: { interestId, user: { status: 'ACTIVE' }, NOT: { userId: me.id } },
      select: { userId: true },
    });

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

    const page = ranked.slice(offset, offset + PEOPLE_PAGE_SIZE);
    const ids = page.map((row) => row.userId);

    const [users, relations] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids } } }),
      this.relations.forUsers(me.id, ids),
    ]);
    const userById = new Map(users.map((user) => [user.id, user]));

    const people: InterestPersonItem[] = [];
    for (const row of page) {
      const user = userById.get(row.userId);
      if (!user) continue;
      people.push({
        user: this.presenter.toPublicUser(
          user,
          [],
          relations.get(user.id),
          row.commonCount,
        ),
        commonCount: row.commonCount,
      });
    }

    return { people, total: ranked.length };
  }

  /**
   * 관심사 저장. 이야깃거리는 최소 [P-01] 이상 최대 [P-02] 이하(FR-1.3).
   * 속성(층)은 개수에 세지 않고, 분류당 하나만 고를 수 있다(D-72).
   * 변경 이력을 남기고(docs/08 §3) holderCount를 같은 트랜잭션에서 맞춘다.
   */
  async replace(userId: string, interestIds: string[]): Promise<InterestRef[]> {
    const unique = [...new Set(interestIds)];
    const [min, max, found] = await Promise.all([
      this.parameters.get('P-01'),
      this.parameters.get('P-02'),
      this.prisma.interest.findMany({
        where: { id: { in: unique } },
        select: { id: true, categoryId: true, category: { select: { kind: true } } },
      }),
    ]);
    if (found.length !== unique.length) throw new AppError('NOT_FOUND');

    const topicCount = found.filter(
      (interest) => interest.category.kind === 'INTEREST',
    ).length;

    const attributeCategories = new Set<string>();
    for (const interest of found) {
      if (interest.category.kind !== 'ATTRIBUTE') continue;
      if (attributeCategories.has(interest.categoryId)) {
        throw new AppError('INTEREST_ATTRIBUTE_SINGLE');
      }
      attributeCategories.add(interest.categoryId);
    }

    if (topicCount < min) {
      throw new AppError(
        'INTEREST_COUNT_MIN',
        { min, selected: topicCount },
        `${min - topicCount}개 더 고르면 추천이 생길 가능성이 높아집니다.`,
      );
    }
    if (topicCount > max) {
      throw new AppError(
        'INTEREST_COUNT_MAX',
        { max },
        `최대 ${max}개까지 고를 수 있습니다. 정말 중요한 것만 남겨보세요.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.userInterest.findMany({
        where: { userId },
        select: { interestId: true },
      });
      const currentIds = new Set(current.map((row) => row.interestId));
      const nextIds = new Set(unique);

      const added = unique.filter((id) => !currentIds.has(id));
      const removed = [...currentIds].filter((id) => !nextIds.has(id));

      if (removed.length) {
        await tx.userInterest.deleteMany({
          where: { userId, interestId: { in: removed } },
        });
        await tx.interest.updateMany({
          where: { id: { in: removed } },
          data: { holderCount: { decrement: 1 } },
        });
      }

      if (added.length) {
        await tx.userInterest.createMany({
          data: added.map((interestId) => ({ userId, interestId })),
        });
        await tx.interest.updateMany({
          where: { id: { in: added } },
          data: { holderCount: { increment: 1 } },
        });
      }

      if (added.length || removed.length) {
        await tx.userInterestChange.createMany({
          data: [
            ...added.map((interestId) => ({
              userId,
              interestId,
              action: 'ADD' as const,
            })),
            ...removed.map((interestId) => ({
              userId,
              interestId,
              action: 'REMOVE' as const,
            })),
          ],
        });
      }
    });

    return this.refsFor(userId);
  }

  /**
   * 관심사 상세의 "내 관심사에 추가" 버튼(docs/06 §3.3). 추가 즉시 그래프가 갱신된다.
   * 속성(층)이면 같은 분류의 기존 선택을 새것으로 바꾼다 — 층은 하나뿐이다(D-72).
   */
  async addOne(userId: string, interestId: string): Promise<InterestRef[]> {
    const [current, target] = await Promise.all([
      this.prisma.userInterest.findMany({
        where: { userId },
        select: {
          interestId: true,
          interest: { select: { categoryId: true, category: { select: { kind: true } } } },
        },
      }),
      this.prisma.interest.findUnique({
        where: { id: interestId },
        select: { categoryId: true, category: { select: { kind: true } } },
      }),
    ]);
    if (!target) throw new AppError('NOT_FOUND');

    const ids = current
      .filter(
        (row) =>
          !(
            target.category.kind === 'ATTRIBUTE' &&
            row.interest.categoryId === target.categoryId
          ),
      )
      .map((row) => row.interestId);
    if (ids.includes(interestId)) return this.refsFor(userId);
    return this.replace(userId, [...ids, interestId]);
  }

  async removeOne(userId: string, interestId: string): Promise<InterestRef[]> {
    const current = await this.prisma.userInterest.findMany({
      where: { userId },
      select: { interestId: true },
    });
    return this.replace(
      userId,
      current.map((row) => row.interestId).filter((id) => id !== interestId),
    );
  }

  // ── 사용자 직접 추가 (D-74) ─────────────────────────────

  /**
   * 입력 중 비슷한 기존 관심사를 보여준다. 추가 전에 "이미 있는 것"을 고르게 하는 장치다.
   * 숨겨진 관심사는 목록에 내보내지 않는다 — 그것은 운영자가 내린 것이다.
   */
  async similar(query: string): Promise<SimilarInterest[]> {
    const term = query.trim();
    if (!term) return [];

    const candidates = await this.topicCandidates();
    return findSimilarInterests(term, candidates)
      .filter((hit) => hit.candidate.status === 'ACTIVE')
      .map((hit) => this.toSimilar(hit.candidate, hit.match));
  }

  /**
   * 관심사를 만든다. 만든 사람의 선택에는 넣지 않는다 — 화면이 고른 뒤 저장한다.
   * 같은 뜻(EXACT)이면 막고, 비슷한 것이 있으면 확인(confirmSimilar)을 받는다.
   * 운영자 채널에 한 줄 남겨 병합·숨김 판단 재료로 쓴다(docs/08 §5).
   */
  async create(me: User, input: CreateInterestInput): Promise<CreatedInterest> {
    const name = input.name.trim().replace(/\s+/g, ' ');

    const category = await this.prisma.category.findUnique({
      where: { id: input.categoryId },
    });
    if (!category || category.kind !== 'INTEREST') {
      throw new AppError('INTEREST_CATEGORY_INVALID');
    }

    const createdToday = await this.prisma.interest.count({
      where: { createdById: me.id, createdAt: { gte: this.startOfToday() } },
    });
    if (createdToday >= CREATE_PER_DAY) {
      throw new AppError('INTEREST_CREATE_LIMIT', { limit: CREATE_PER_DAY });
    }

    const hits = findSimilarInterests(name, await this.topicCandidates());

    const exact = hits.find((hit) => hit.match === 'EXACT');
    if (exact) {
      const existing = exact.candidate;
      throw new AppError(
        'INTEREST_EXISTS',
        { interest: this.toSimilar(existing, 'EXACT'), matchedText: exact.matchedText },
        existing.status === 'ACTIVE'
          ? `"${existing.name}"이(가) 이미 있습니다. 목록에서 골라주세요.`
          : `"${existing.name}"은(는) 운영자가 목록에서 내린 관심사입니다.`,
      );
    }

    const similar = hits
      .filter((hit) => hit.candidate.status === 'ACTIVE')
      .map((hit) => this.toSimilar(hit.candidate, hit.match));
    if (similar.length > 0 && !input.confirmSimilar) {
      throw new AppError('INTEREST_SIMILAR', { similar });
    }

    const last = await this.prisma.interest.aggregate({
      where: { categoryId: category.id },
      _max: { sortOrder: true },
    });

    const interest = await this.prisma.interest.create({
      data: {
        name,
        categoryId: category.id,
        createdById: me.id,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
      },
    });

    this.logger.log(`관심사 추가: "${name}" (${category.name}) by ${me.id}`);
    void this.mattermost
      .sendToDefaultChannel(
        [
          `**새 관심사** \`${name}\` (${category.name})`,
          `추가한 사람: @${me.mattermostUsername ?? '?'}`,
          similar.length
            ? `비슷한 기존 관심사: ${similar.map((item) => item.name).join(', ')} — 병합할지 확인`
            : '비슷한 기존 관심사 없음',
        ].join('\n'),
      )
      .catch((error: unknown) => this.logger.warn(`운영자 채널 기록 실패: ${String(error)}`));

    return {
      id: interest.id,
      name: interest.name,
      categoryId: interest.categoryId,
      aliases: interest.aliases,
      holderCount: 0,
    };
  }

  /** 중복 검사 후보. 숨김·병합된 것도 포함한다 — 운영자가 내린 이름을 다시 만들 수 없어야 한다. */
  private topicCandidates(): Promise<InterestWithCategory[]> {
    return this.prisma.interest.findMany({
      where: { category: { kind: 'INTEREST' } },
      include: { category: { select: { id: true, name: true, kind: true } } },
    });
  }

  private toSimilar(
    interest: InterestWithCategory,
    match: 'EXACT' | 'SIMILAR',
  ): SimilarInterest {
    return {
      id: interest.id,
      name: interest.name,
      categoryId: interest.categoryId,
      categoryName: interest.category.name,
      holderCount: interest.holderCount,
      match,
    };
  }

  /** KST 달력 하루(D-60). 프로세스 TZ가 Asia/Seoul이다(design/20 §13). */
  private startOfToday(): Date {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }
}

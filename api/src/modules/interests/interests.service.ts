import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type {
  InterestCatalog,
  InterestDetail,
  InterestPersonItem,
  InterestRef,
} from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RelationService } from '../connections/relation.service';
import { ParametersService } from '../parameters/parameters.service';
import { CommonInterestsService } from '../recommendation/common-interests.service';
import { UserPresenter } from '../users/user.presenter';

/** 관심사 상세의 사람 목록은 한 번에 이만큼 보여주고 "더 보기"로 잇는다(docs/06 §3.3). */
const PEOPLE_PAGE_SIZE = 20;

@Injectable()
export class InterestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parameters: ParametersService,
    private readonly common: CommonInterestsService,
    private readonly relations: RelationService,
    private readonly presenter: UserPresenter,
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

    return {
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        interests: category.interests
          .filter(
            (interest) =>
              interest.status === 'ACTIVE' || mineIds.has(interest.id),
          )
          .map((interest) => ({
            id: interest.id,
            name: interest.name,
            // "여기 고르면 누가 있을지"의 힌트다(docs/06 §3.1.4).
            holderCount: interest.holderCount,
            mine: mineIds.has(interest.id),
            status: interest.status,
          })),
      })),
      selectedCount: mineIds.size,
      min,
      max,
    };
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

    const { people, total } = await this.people(me, interestId, 0);

    return {
      id: interest.id,
      name: interest.name,
      categoryId: interest.categoryId,
      categoryName: interest.category.name,
      holderCount: interest.holderCount,
      mine,
      // 관심사를 가진 사람만 글을 쓸 수 있다(FR-6.1). 아니면 추가하도록 유도한다.
      canPost: mine,
      peopleTotal: total,
      people,
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
   * 관심사 저장. 최소 [P-01] 이상 최대 [P-02] 이하(FR-1.3).
   * 변경 이력을 남기고(docs/08 §3) holderCount를 같은 트랜잭션에서 맞춘다.
   */
  async replace(userId: string, interestIds: string[]): Promise<InterestRef[]> {
    const unique = [...new Set(interestIds)];
    const [min, max] = await Promise.all([
      this.parameters.get('P-01'),
      this.parameters.get('P-02'),
    ]);

    if (unique.length < min) {
      throw new AppError(
        'INTEREST_COUNT_MIN',
        { min, selected: unique.length },
        `${min - unique.length}개 더 고르면 추천이 생길 가능성이 높아집니다.`,
      );
    }
    if (unique.length > max) {
      throw new AppError(
        'INTEREST_COUNT_MAX',
        { max },
        `최대 ${max}개까지 고를 수 있습니다. 정말 중요한 것만 남겨보세요.`,
      );
    }

    const found = await this.prisma.interest.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) throw new AppError('NOT_FOUND');

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

  /** 관심사 상세의 "내 관심사에 추가" 버튼(docs/06 §3.3). 추가 즉시 그래프가 갱신된다. */
  async addOne(userId: string, interestId: string): Promise<InterestRef[]> {
    const current = await this.prisma.userInterest.findMany({
      where: { userId },
      select: { interestId: true },
    });
    const ids = current.map((row) => row.interestId);
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
}

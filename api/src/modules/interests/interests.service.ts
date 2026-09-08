import { Injectable } from '@nestjs/common';
import type { InterestCatalog, InterestRef } from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ParametersService } from '../parameters/parameters.service';

@Injectable()
export class InterestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parameters: ParametersService,
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

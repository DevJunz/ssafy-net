import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type {
  InterestRef,
  SimilarPeopleResponse,
  SimilarPersonItem,
} from '@ssafy-net/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RelationService } from '../connections/relation.service';
import { ParametersService } from '../parameters/parameters.service';
import { UserPresenter } from '../users/user.presenter';
import { CommonInterestsService } from './common-interests.service';

/**
 * Similar People (docs/13 §3).
 *
 * 이유 없는 추천은 없다(원칙 1). 모든 항목에 공통 관심사 이름이 전부 붙는다(원칙 3).
 * 점수와 퍼센트는 응답에 넣지 않는다(원칙 2, D-51).
 */
@Injectable()
export class RecommendationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parameters: ParametersService,
    private readonly common: CommonInterestsService,
    private readonly relations: RelationService,
    private readonly presenter: UserPresenter,
  ) {}

  async similarPeople(
    me: User,
    options: { newOnly?: boolean } = {},
  ): Promise<SimilarPeopleResponse> {
    const [myInterestIds, activeUsers, minCommon, edgeLimit] =
      await Promise.all([
        this.common.myInterestIds(me.id),
        this.common.activeUserCount(),
        this.parameters.get('P-03'),
        this.parameters.get('P-15'),
      ]);

    const ranked = this.common
      .sort(await this.common.findOverlapping(me.id, myInterestIds, activeUsers))
      .filter((row) => row.commonCount >= minCommon);

    const userIds = ranked.map((row) => row.userId);
    const [users, relations, interests] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds } } }),
      this.relations.forUsers(me.id, userIds),
      this.loadInterestRefs(myInterestIds),
    ]);
    const userById = new Map(users.map((user) => [user.id, user]));

    const items: SimilarPersonItem[] = [];
    let hiddenCount = 0;

    ranked.forEach((row, index) => {
      const user = userById.get(row.userId);
      if (!user) return;

      const relation = relations.get(row.userId) ?? {
        status: 'NONE' as const,
        requestId: null,
        reRequestableAt: null,
      };

      // 이미 처리한 사람을 목록에서 없애지 않는다. 사라지는 순간
      // "왜 이 사람이 없어졌지"가 되어 설명 불가능한 추천이 된다(docs/13 §3.4).
      // 필터는 사용자가 고른다.
      if (
        options.newOnly &&
        relation.status !== 'NONE' &&
        relation.status !== 'SELF'
      ) {
        hiddenCount += 1;
        return;
      }

      const commonInterests = row.commonInterestIds
        .map((id) => interests.get(id))
        .filter((ref): ref is InterestRef => Boolean(ref));

      items.push({
        user: this.presenter.toPublicUser(
          user,
          commonInterests.map((ref) => ({ ...ref, isCommon: true })),
          relation,
          row.commonCount,
        ),
        commonInterests,
        commonCount: row.commonCount,
        inGraph: index < edgeLimit,
      });
    });

    return {
      criterion: {
        minCommon,
        // 사용자가 순서를 예측할 수 있어야 한다(원칙 4). 화면 상단에 이 문장을 그대로 쓴다.
        sortBy: '공통 관심사가 많은 순, 같으면 드문 관심사를 공유하는 순',
      },
      total: ranked.length,
      items,
      hiddenCount,
    };
  }

  private async loadInterestRefs(
    ids: string[],
  ): Promise<Map<string, InterestRef>> {
    if (ids.length === 0) return new Map();
    const interests = await this.prisma.interest.findMany({
      where: { id: { in: ids } },
      orderBy: { sortOrder: 'asc' },
    });
    return new Map(
      interests.map((interest) => [
        interest.id,
        {
          id: interest.id,
          name: interest.name,
          categoryId: interest.categoryId,
        },
      ]),
    );
  }
}

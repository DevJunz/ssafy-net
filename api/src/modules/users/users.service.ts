import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { ConnectedUser, InterestRef, PublicUser } from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RelationService } from '../connections/relation.service';
import { PostsService } from '../posts/posts.service';
import { UserPresenter } from './user.presenter';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relations: RelationService,
    private readonly presenter: UserPresenter,
    private readonly posts: PostsService,
  ) {}

  /**
   * Person Profile (docs/06 §3.4).
   *
   * 관심사는 전체를 보여주되 공통을 앞에 모아 구분한다.
   * 실명은 연결됨 상태에서만 나간다 — ConnectedUser를 쓰는 유일한 조건이다
   * (design/20 §11, docs/12 §1).
   */
  async profile(
    me: User,
    targetId: string,
  ): Promise<PublicUser | ConnectedUser> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new AppError('NOT_FOUND');

    // 온보딩을 마치지 않은 사람은 다른 사람에게 보이지 않는다(FR-1.6).
    if (target.status === 'ONBOARDING' && target.id !== me.id) {
      throw new AppError('NOT_FOUND');
    }

    if (target.status === 'WITHDRAWN') {
      return this.presenter.toPublicUser(target);
    }

    const [theirInterests, myInterestIds, relation, recentPosts] = await Promise.all([
      this.prisma.userInterest.findMany({
        where: { userId: targetId },
        include: { interest: true },
      }),
      this.prisma.userInterest
        .findMany({ where: { userId: me.id }, select: { interestId: true } })
        .then((rows) => new Set(rows.map((row) => row.interestId))),
      this.relations.forUser(me.id, targetId),
      // 글은 "이 사람이 무엇을 이야기하고 싶어 하는지"를 보여준다(docs/11 §1).
      this.posts.byAuthor(targetId),
    ]);

    const refs: InterestRef[] = theirInterests
      .map((row) => ({
        id: row.interest.id,
        name: row.interest.name,
        categoryId: row.interest.categoryId,
        isCommon: myInterestIds.has(row.interest.id),
      }))
      // 공통 관심사를 앞에 모은다(docs/06 §3.4).
      .sort((a, b) => Number(b.isCommon) - Number(a.isCommon));

    const commonCount = refs.filter((ref) => ref.isCommon).length;

    const view =
      relation.status === 'CONNECTED'
        ? this.presenter.toConnectedUser(target, refs, relation, commonCount)
        : this.presenter.toPublicUser(target, refs, relation, commonCount);

    return { ...view, recentPosts };
  }
}

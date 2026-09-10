import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type {
  ConnectedUser,
  DisplayNameInput,
  InterestRef,
  PublicUser,
} from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RelationService } from '../connections/relation.service';
import { PostsService } from '../posts/posts.service';
import { nextDisplayNameChangeAt } from './display-name-policy';
import { NicknameService } from './nickname.service';
import { UserPresenter } from './user.presenter';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relations: RelationService,
    private readonly presenter: UserPresenter,
    private readonly posts: PostsService,
    private readonly nickname: NicknameService,
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
        include: { interest: { include: { category: true } } },
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

    // 같은 층은 칩으로는 강조하되(isCommon) 공통 개수에는 세지 않는다(D-72).
    const commonCount = theirInterests.filter(
      (row) =>
        row.interest.category.kind === 'INTEREST' &&
        myInterestIds.has(row.interest.id),
    ).length;

    const view =
      relation.status === 'CONNECTED'
        ? this.presenter.toConnectedUser(target, refs, relation, commonCount)
        : this.presenter.toPublicUser(target, refs, relation, commonCount);

    return { ...view, recentPosts };
  }

  /**
   * 표시명 변경 (docs/06 §3.10, docs/12 §3).
   *
   * 온보딩의 첫 선택(`initial`)과 프로필에서의 변경이 같은 길을 쓴다. 다른 점은 둘이다 —
   * 프로필에서는 하루 1회(`NICKNAME_CHANGE_TOO_SOON`)이고, 같은 값을 다시 저장하면 아무것도
   * 하지 않는다. 닉네임 규칙(중복·실명 유사·부적절 표현, D-49)은 두 경우 모두 검사한다.
   * 온보딩에서 고른 첫 표시명은 변경으로 세지 않는다(display-name-policy.ts).
   */
  async setDisplayName(
    user: User,
    input: DisplayNameInput,
    options: { initial?: boolean } = {},
  ): Promise<{ displayName: string }> {
    const nickname = input.type === 'NICKNAME' ? input.nickname.trim() : null;

    if (!options.initial) {
      const unchanged =
        user.displayNameType === input.type &&
        (input.type === 'REAL' || user.nickname === nickname);
      if (unchanged) return { displayName: this.presenter.displayName(user) };

      const nextAt = nextDisplayNameChangeAt(user);
      if (nextAt) {
        throw new AppError('NICKNAME_CHANGE_TOO_SOON', {
          nextChangeAt: nextAt.toISOString(),
        });
      }
    }

    if (nickname !== null) {
      const verdict = await this.nickname.check(nickname, user.id);
      if (!verdict.ok) throw new AppError(verdict.code);
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        displayNameType: input.type,
        nickname,
        nicknameChangedAt: new Date(),
      },
    });
    return { displayName: this.presenter.displayName(updated) };
  }
}

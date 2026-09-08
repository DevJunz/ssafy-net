import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { PostInput, PostSummary } from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** 관심사당 하루, 전체 하루 (docs/11 §2). 게시판화 방지 장치다. */
const PER_INTEREST_PER_DAY = 1;
const TOTAL_PER_DAY = 3;

/**
 * Interest Post (docs/11).
 *
 * 게시글은 **커뮤니티가 아니다.** "이 관심사에서 누가, 무엇을 이야기하고 싶어
 * 하는지"를 드러내 사람 발견의 계기를 만드는 장치다.
 *
 * 그 정의를 지키려고 기능을 의도적으로 빈약하게 둔다 — 댓글·좋아요·조회수·
 * 피드·검색이 모두 없다(D-46). 글의 유일한 출구는 작성자 프로필이고,
 * 거기서 연결 요청으로 이어진다.
 */
@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  private startOfDay(): Date {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  async create(me: User, input: PostInput): Promise<PostSummary> {
    // 관심사를 가진 사람만 쓸 수 있다(FR-6.1).
    // 관심사 없이 글을 쓰면 "관심사 = 활동"의 연결이 끊긴다.
    const owns = await this.prisma.userInterest.findUnique({
      where: {
        userId_interestId: { userId: me.id, interestId: input.interestId },
      },
      include: { interest: { include: { category: true } } },
    });
    if (!owns) throw new AppError('POST_INTEREST_NOT_OWNED');
    // 층 같은 속성에 글을 허용하면 층별 게시판이 된다. 글은 이야깃거리에만 붙는다(D-72).
    if (owns.interest.category.kind !== 'INTEREST') {
      throw new AppError(
        'INTEREST_CATEGORY_INVALID',
        undefined,
        '층에는 글을 남길 수 없습니다.',
      );
    }

    const since = this.startOfDay();
    const [perInterest, total] = await Promise.all([
      this.prisma.interestPost.count({
        where: {
          authorId: me.id,
          interestId: input.interestId,
          createdAt: { gte: since },
          deletedAt: null,
        },
      }),
      this.prisma.interestPost.count({
        where: { authorId: me.id, createdAt: { gte: since }, deletedAt: null },
      }),
    ]);

    if (perInterest >= PER_INTEREST_PER_DAY) {
      throw new AppError('POST_LIMIT_REACHED');
    }
    if (total >= TOTAL_PER_DAY) {
      throw new AppError(
        'POST_LIMIT_REACHED',
        undefined,
        '오늘 남길 수 있는 글을 모두 썼습니다.',
      );
    }

    const post = await this.prisma.interestPost.create({
      data: {
        authorId: me.id,
        interestId: input.interestId,
        content: input.content,
      },
      include: { interest: true },
    });

    return {
      id: post.id,
      interestId: post.interestId,
      interestName: post.interest.name,
      content: post.content,
      createdAt: post.createdAt.toISOString(),
    };
  }

  /** 수정은 없다. 삭제 후 재작성한다(docs/11 §3). */
  async remove(me: User, id: string) {
    const post = await this.prisma.interestPost.findUnique({ where: { id } });
    if (!post || post.deletedAt) throw new AppError('NOT_FOUND');
    if (post.authorId !== me.id && !me.isOperator) throw new AppError('FORBIDDEN');

    await this.prisma.interestPost.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * 관심사의 최근 글.
   *
   * **작성자가 그 관심사를 아직 가지고 있는지**를 조인으로 확인한다.
   * 숨김 플래그를 두지 않는 이유는, 관심사를 다시 추가하면 글이 저절로
   * 돌아와야 하기 때문이다(docs/11 §3).
   */
  async byInterest(interestId: string, limit = 5): Promise<PostSummary[]> {
    const posts = await this.prisma.interestPost.findMany({
      where: {
        interestId,
        deletedAt: null,
        author: {
          status: 'ACTIVE',
          interests: { some: { interestId } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { interest: true, author: true },
    });

    return posts.map((post) => ({
      id: post.id,
      interestId: post.interestId,
      interestName: post.interest.name,
      content: post.content,
      createdAt: post.createdAt.toISOString(),
      authorId: post.authorId,
    }));
  }

  /** 사람의 최근 글. 프로필과 요청 상세, 연결 성립 화면에 붙는다(docs/11 §4). */
  async byAuthor(authorId: string, limit = 3): Promise<PostSummary[]> {
    const posts = await this.prisma.interestPost.findMany({
      where: {
        authorId,
        deletedAt: null,
        // 관심사를 뺐으면 그 글도 함께 숨겨진다.
        interest: { users: { some: { userId: authorId } } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { interest: true },
    });

    return posts.map((post) => ({
      id: post.id,
      interestId: post.interestId,
      interestName: post.interest.name,
      content: post.content,
      createdAt: post.createdAt.toISOString(),
    }));
  }

  /** 내가 쓴 글. My Profile에서 관리한다(docs/06 §3.10). */
  async mine(me: User): Promise<PostSummary[]> {
    const posts = await this.prisma.interestPost.findMany({
      where: { authorId: me.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { interest: true },
    });

    return posts.map((post) => ({
      id: post.id,
      interestId: post.interestId,
      interestName: post.interest.name,
      content: post.content,
      createdAt: post.createdAt.toISOString(),
    }));
  }
}

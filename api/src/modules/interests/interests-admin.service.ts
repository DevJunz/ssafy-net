import { Injectable, Logger } from '@nestjs/common';
import type {
  AdminInterest,
  CreateAdminInterestInput,
  UpdateAdminInterestInput,
} from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * 관심사 관리 (D-88). 운영자만.
 *
 * 관심사 목록은 이 서비스의 주인이 운영자라는 전제로 움직인다 — 사용자도 직접 만들 수 있지만(D-74)
 * 다듬고 합치고 내리는 일은 여기서 한다. 사용자 추가에 걸리는 하루 3개 제한과 "비슷한 것 확인"은
 * 여기에는 없다. 대신 같은 이름은 여전히 막는다(name 이 unique 다).
 *
 * 지우는 것과 숨기는 것을 구분한다:
 *   - **숨김(HIDDEN)** — 목록에서 내린다. 이미 가진 사람에게는 남고 그래프에도 남는다(docs/08 §5).
 *     사람이 든 관심사를 정리하는 길은 이쪽이다.
 *   - **삭제** — 행을 지운다. 고른 사람이 하나도 없을 때만 허용한다. 글·질문·이력은 같이 사라진다.
 *     이미 성립한 연결이나 네트워크가 그 id 를 들고 있어도 화면은 없는 것을 지나친다(pick 이 걸러낸다).
 *
 * 합치기(MERGED)는 아직 없다. 모델에는 자리가 있지만 보유자를 옮기는 일이라 따로 만든다.
 */
@Injectable()
export class InterestsAdminService {
  private readonly logger = new Logger(InterestsAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 전체 목록. 분류 순서 → 관심사 순서. 숨김·병합된 것도 준다 — 운영자는 내린 것도 봐야 한다.
   * 보유자 수는 비정규화 값(holderCount)이 아니라 실제로 센 것이다. 둘이 어긋나 있으면 여기서 드러난다.
   */
  async list(): Promise<AdminInterest[]> {
    const rows = await this.prisma.interest.findMany({
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        category: { select: { id: true, name: true, kind: true } },
        _count: {
          select: {
            users: true,
            posts: { where: { deletedAt: null } },
            questions: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      aliases: row.aliases,
      categoryId: row.categoryId,
      categoryName: row.category.name,
      categoryKind: row.category.kind,
      status: row.status,
      holderCount: row._count.users,
      postCount: row._count.posts,
      questionCount: row._count.questions,
      sortOrder: row.sortOrder,
      userAdded: row.createdById !== null,
    }));
  }

  async create(input: CreateAdminInterestInput): Promise<AdminInterest> {
    const name = this.clean(input.name);
    await this.assertNameFree(name);

    const category = await this.prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) throw new AppError('INTEREST_CATEGORY_INVALID');

    const last = await this.prisma.interest.aggregate({
      where: { categoryId: category.id },
      _max: { sortOrder: true },
    });

    const row = await this.prisma.interest.create({
      data: {
        name,
        categoryId: category.id,
        aliases: (input.aliases ?? []).map((alias) => this.clean(alias)),
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });

    this.logger.log(`관심사 추가(운영): "${name}" (${category.name})`);
    return this.one(row.id);
  }

  /**
   * 이름·별칭·분류·순서·상태를 고친다.
   *
   * 분류를 옮길 때 종류(이야깃거리↔속성)가 달라지면 이미 고른 사람들의 규칙이 바뀐다 —
   * 속성은 분류당 하나뿐이라(D-72) 옮기는 순간 규칙을 어기는 사람이 생길 수 있다. 그래서 보유자가 없을 때만 허용한다.
   */
  async update(id: string, input: UpdateAdminInterestInput): Promise<AdminInterest> {
    const row = await this.prisma.interest.findUnique({
      where: { id },
      include: {
        category: { select: { kind: true } },
        _count: { select: { users: true } },
      },
    });
    if (!row) throw new AppError('NOT_FOUND');

    const name = input.name === undefined ? undefined : this.clean(input.name);
    if (name && name !== row.name) await this.assertNameFree(name, id);

    let categoryId: string | undefined;
    if (input.categoryId !== undefined && input.categoryId !== row.categoryId) {
      const next = await this.prisma.category.findUnique({ where: { id: input.categoryId } });
      if (!next) throw new AppError('INTEREST_CATEGORY_INVALID');
      if (next.kind !== row.category.kind && row._count.users > 0) {
        throw new AppError(
          'VALIDATION_FAILED',
          { holderCount: row._count.users, from: row.category.kind, to: next.kind },
          `이 관심사를 고른 사람이 ${row._count.users}명 있습니다. 종류가 다른 분류(${
            next.kind === 'ATTRIBUTE' ? '속성' : '이야깃거리'
          })로는 아무도 고르지 않았을 때만 옮길 수 있습니다.`,
        );
      }
      categoryId = next.id;
    }

    await this.prisma.interest.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(input.aliases ? { aliases: input.aliases.map((alias) => this.clean(alias)) } : {}),
        ...(input.status ? { status: input.status } : {}),
        // 분류를 옮기면 새 분류의 맨 뒤로 보낸다. 옮긴 자리의 순서는 그 다음에 정한다.
        ...(categoryId ? { sortOrder: await this.nextSortOrder(categoryId) } : {}),
      },
    });

    if (input.sortOrder !== undefined) {
      await this.reorder(id, categoryId ?? row.categoryId, input.sortOrder);
    }

    return this.one(id);
  }

  /**
   * 아무도 고르지 않았을 때만 지운다. 사람이 있으면 숨김을 권한다 —
   * 지우면 그 사람들의 선택과 글, 이력이 함께 사라지고 되돌릴 수 없다.
   */
  async remove(id: string): Promise<void> {
    const row = await this.prisma.interest.findUnique({
      where: { id },
      include: { _count: { select: { users: true, posts: { where: { deletedAt: null } } } } },
    });
    if (!row) throw new AppError('NOT_FOUND');

    if (row._count.users > 0) {
      throw new AppError(
        'VALIDATION_FAILED',
        { holderCount: row._count.users },
        `이 관심사를 고른 사람이 ${row._count.users}명 있습니다. 목록에서 내리려면 숨김으로 바꾸세요.`,
      );
    }

    await this.prisma.interest.delete({ where: { id } });
    this.logger.log(
      `관심사 삭제(운영): "${row.name}" (글 ${row._count.posts}개 함께 삭제)`,
    );
  }

  // ── 도구 ────────────────────────────────────────────────

  private async one(id: string): Promise<AdminInterest> {
    const found = (await this.list()).find((item) => item.id === id);
    if (!found) throw new AppError('NOT_FOUND');
    return found;
  }

  /** 이름은 공백을 하나로 줄여 저장한다. 별칭도 같은 규칙이다. */
  private clean(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  /** 같은 이름은 숨김·병합된 것을 포함해 막는다 — 운영자가 내린 이름이 다시 살아나면 안 된다. */
  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const dup = await this.prisma.interest.findUnique({ where: { name } });
    if (dup && dup.id !== exceptId) {
      throw new AppError(
        'VALIDATION_FAILED',
        { interestId: dup.id, status: dup.status },
        dup.status === 'ACTIVE'
          ? `"${name}"이(가) 이미 있습니다.`
          : `"${name}"은(는) 목록에서 내려둔 관심사입니다. 그것을 다시 보이게 하세요.`,
      );
    }
  }

  private async nextSortOrder(categoryId: string): Promise<number> {
    const last = await this.prisma.interest.aggregate({
      where: { categoryId },
      _max: { sortOrder: true },
    });
    return (last._max.sortOrder ?? -1) + 1;
  }

  /** 같은 분류 안에서 0부터 다시 매긴다. 옮긴 것이 그 자리에 들어가고 나머지는 상대 순서를 지킨다. */
  private async reorder(id: string, categoryId: string, to: number): Promise<void> {
    const rows = await this.prisma.interest.findMany({
      where: { categoryId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true },
    });
    const rest = rows.filter((row) => row.id !== id);
    const index = Math.max(0, Math.min(to, rest.length));
    const ordered = [...rest.slice(0, index), { id }, ...rest.slice(index)];
    await this.prisma.$transaction(
      ordered.map((row, sortOrder) =>
        this.prisma.interest.update({ where: { id: row.id }, data: { sortOrder } }),
      ),
    );
  }
}

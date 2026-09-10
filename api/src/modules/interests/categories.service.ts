import { Injectable } from '@nestjs/common';
import type { AdminCategory, CreateCategoryInput, UpdateCategoryInput } from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * 관심사 분류(대분류) 관리 (D-86). 운영자만.
 *
 * 분류는 관심사 목록의 묶음이자 그래프의 색이다. 이름을 고치고 순서를 바꾸고, 비어 있을 때만 지운다 —
 * 관심사가 든 분류를 지우면 그 관심사와 사람들의 선택이 같이 사라지기 때문이다.
 * 새 분류의 색은 그래프가 처음 본 순서로 배정한다(encoding.ts). 정해 두지 않는다(D-34).
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AdminCategory[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { interests: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      sortOrder: row.sortOrder,
      interestCount: row._count.interests,
    }));
  }

  async create(input: CreateCategoryInput): Promise<AdminCategory> {
    const name = input.name.trim().replace(/\s+/g, ' ');
    const exists = await this.prisma.category.findUnique({ where: { name } });
    if (exists) throw new AppError('VALIDATION_FAILED', undefined, '같은 이름의 분류가 이미 있습니다.');

    const last = await this.prisma.category.aggregate({ _max: { sortOrder: true } });
    const row = await this.prisma.category.create({
      data: { name, kind: input.kind, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    return { id: row.id, name: row.name, kind: row.kind, sortOrder: row.sortOrder, interestCount: 0 };
  }

  async update(id: string, input: UpdateCategoryInput): Promise<AdminCategory> {
    const row = await this.prisma.category.findUnique({ where: { id } });
    if (!row) throw new AppError('NOT_FOUND');

    const name = input.name?.trim().replace(/\s+/g, ' ');
    if (name && name !== row.name) {
      const dup = await this.prisma.category.findUnique({ where: { name } });
      if (dup) throw new AppError('VALIDATION_FAILED', undefined, '같은 이름의 분류가 이미 있습니다.');
    }

    if (input.sortOrder !== undefined && input.sortOrder !== row.sortOrder) {
      await this.reorder(id, input.sortOrder);
    }
    if (name && name !== row.name) {
      await this.prisma.category.update({ where: { id }, data: { name } });
    }

    const list = await this.list();
    const found = list.find((item) => item.id === id);
    if (!found) throw new AppError('NOT_FOUND');
    return found;
  }

  /** 순서를 0부터 다시 매긴다. 옮긴 것이 그 자리에 들어가고 나머지는 상대 순서를 지킨다. */
  private async reorder(id: string, to: number): Promise<void> {
    const rows = await this.prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });
    const rest = rows.filter((row) => row.id !== id);
    const index = Math.max(0, Math.min(to, rest.length));
    const ordered = [...rest.slice(0, index), { id }, ...rest.slice(index)];
    await this.prisma.$transaction(
      ordered.map((row, sortOrder) =>
        this.prisma.category.update({ where: { id: row.id }, data: { sortOrder } }),
      ),
    );
  }

  /** 비어 있을 때만. 관심사가 있으면 먼저 옮기거나 지워야 한다. */
  async remove(id: string): Promise<void> {
    const row = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { interests: true } } },
    });
    if (!row) throw new AppError('NOT_FOUND');
    if (row._count.interests > 0) {
      throw new AppError(
        'VALIDATION_FAILED',
        { interestCount: row._count.interests },
        `이 분류에 관심사가 ${row._count.interests}개 있습니다. 비어 있어야 지울 수 있습니다.`,
      );
    }
    await this.prisma.category.delete({ where: { id } });
  }
}

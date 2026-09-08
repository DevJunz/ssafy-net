import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { SuggestionInput } from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * 관심사 제안 (docs/08 §4, S4).
 *
 * 원하는 관심사가 없어 이탈하는 사람을 잡고, 목록을 고칠 신호를 얻는다.
 * 사용자가 직접 관심사를 만들지는 못한다 — 자유 입력은 "백엔드/백앤드/Backend"처럼
 * 같은 뜻이 흩어져 공통 관심사 계산을 망친다(docs/08 §1).
 *
 * 사용이 2주에 집중되므로 첫 주에는 매일 확인해야 한다. 채택이 늦으면
 * 제안자가 이미 떠난 뒤다.
 */
@Injectable()
export class SuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** 입력 중 비슷한 기존 관심사를 보여준다. 중복 제안을 줄이는 장치다. */
  async similar(query: string) {
    const term = query.trim();
    if (term.length < 1) return [];

    const interests = await this.prisma.interest.findMany({
      where: { status: 'ACTIVE', name: { contains: term, mode: 'insensitive' } },
      orderBy: { holderCount: 'desc' },
      take: 5,
      include: { category: true },
    });

    return interests.map((interest) => ({
      id: interest.id,
      name: interest.name,
      categoryName: interest.category.name,
      holderCount: interest.holderCount,
    }));
  }

  async create(me: User, input: SuggestionInput) {
    const name = input.name.trim();

    const exists = await this.prisma.interest.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (exists) {
      throw new AppError(
        'VALIDATION_FAILED',
        { interestId: exists.id },
        `"${exists.name}"이(가) 이미 있습니다. 목록에서 골라주세요.`,
      );
    }

    const duplicate = await this.prisma.interestSuggestion.findFirst({
      where: { userId: me.id, name, status: 'PENDING' },
    });
    if (duplicate) return { id: duplicate.id, alreadySuggested: true };

    const suggestion = await this.prisma.interestSuggestion.create({
      data: { userId: me.id, name },
    });
    return { id: suggestion.id, alreadySuggested: false };
  }

  // ── 운영자 ──────────────────────────────────────────────

  async pending() {
    const rows = await this.prisma.interestSuggestion.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { realName: true, classNo: true } } },
    });

    // 같은 이름이 몇 번 들어왔는지 — 채택 기준의 하나다(docs/08 §4).
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.name, (counts.get(row.name) ?? 0) + 1);
    }

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      suggestedBy: `${row.user.realName ?? ''}_${row.user.classNo ?? ''}`,
      sameNameCount: counts.get(row.name) ?? 1,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * 채택하면 관심사를 만들고 제안자에게 알린다.
   * 반려하면 사유 한 줄을 함께 보낸다(docs/08 §4).
   */
  async resolve(
    id: string,
    input: { action: 'ACCEPT' | 'REJECT'; categoryId?: string; note?: string },
  ) {
    const suggestion = await this.prisma.interestSuggestion.findUnique({
      where: { id },
    });
    if (!suggestion || suggestion.status !== 'PENDING') {
      throw new AppError('ALREADY_HANDLED');
    }

    if (input.action === 'REJECT') {
      await this.prisma.interestSuggestion.update({
        where: { id },
        data: {
          status: 'REJECTED',
          operatorNote: input.note ?? null,
          resolvedAt: new Date(),
        },
      });
      await this.notifications.notify({
        userId: suggestion.userId,
        type: 'SUGGESTION_RESOLVED',
        payload: {
          reason: `"${suggestion.name}"은(는) 추가하지 않았습니다. ${input.note ?? ''}`.trim(),
        },
        targetPath: '/profile',
      });
      return { ok: true };
    }

    if (!input.categoryId) {
      throw new AppError(
        'VALIDATION_FAILED',
        undefined,
        '채택하려면 Category를 지정해야 합니다.',
      );
    }

    const interest = await this.prisma.interest.create({
      data: { name: suggestion.name, categoryId: input.categoryId },
    });

    await this.prisma.interestSuggestion.updateMany({
      where: { name: suggestion.name, status: 'PENDING' },
      data: {
        status: 'ACCEPTED',
        resolvedInterestId: interest.id,
        resolvedAt: new Date(),
      },
    });

    // 같은 이름을 제안한 사람 모두에게 알린다.
    const others = await this.prisma.interestSuggestion.findMany({
      where: { resolvedInterestId: interest.id },
      select: { userId: true },
      distinct: ['userId'],
    });

    for (const row of others) {
      await this.notifications.notify({
        userId: row.userId,
        type: 'SUGGESTION_RESOLVED',
        payload: {
          reason: `"${interest.name}"을(를) 목록에 추가했습니다. 내 관심사에 넣어보세요.`,
        },
        targetPath: '/profile',
      });
    }

    return { ok: true, interestId: interest.id };
  }
}

import { Injectable } from '@nestjs/common';
import type {
  AdminInterestQuestionSummary,
  AdminQuestion,
  CreateQuestionInput,
  NetworkQuestions,
  UpdateQuestionInput,
} from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** 네트워크가 성립할 때 뽑는 포괄 아이스브레이킹 질문 수(D-87). */
export const ICEBREAKERS_PER_NETWORK = 2;

/**
 * 네트워킹 질문 (D-87).
 *
 * 두 종류다. **주제별 질문**은 관심사마다 고정돼 있어 그 관심사를 공유하는 네트워크에 늘 같은 것이 간다.
 * **포괄 질문**은 주제와 무관한 아이스브레이킹으로, 성립 때 무작위로 2개를 뽑아 네트워크에 고정한다.
 * 둘 다 운영자가 만들고 고치고 지운다. 시드는 출발점일 뿐이다.
 */
@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 성립된 네트워크의 대화 재료. 공유 관심사 순서는 관심사 목록 순서를 따른다. */
  async forNetwork(
    commonInterestIds: string[],
    icebreakerIds: string[],
  ): Promise<NetworkQuestions> {
    const [interests, icebreakers] = await Promise.all([
      this.prisma.interest.findMany({
        where: { id: { in: commonInterestIds } },
        orderBy: { sortOrder: 'asc' },
        include: { questions: { orderBy: { sortOrder: 'asc' } } },
      }),
      icebreakerIds.length
        ? this.prisma.icebreakerQuestion.findMany({ where: { id: { in: icebreakerIds } } })
        : Promise.resolve([]),
    ]);

    // 뽑았을 때의 순서를 지킨다. 지워진 질문은 조용히 빠진다.
    const byId = new Map(icebreakers.map((row) => [row.id, row.text]));

    return {
      byInterest: interests
        .filter((interest) => interest.questions.length > 0)
        .map((interest) => ({
          interestId: interest.id,
          interestName: interest.name,
          questions: interest.questions.map((question) => question.text),
        })),
      icebreakers: icebreakerIds
        .map((id) => byId.get(id))
        .filter((text): text is string => Boolean(text)),
    };
  }

  /** 성립 때 한 번 뽑아 네트워크에 고정한다. 켜져 있는 것 중에서 무작위. */
  async pickIcebreakerIds(count = ICEBREAKERS_PER_NETWORK): Promise<string[]> {
    const active = await this.prisma.icebreakerQuestion.findMany({
      where: { active: true },
      select: { id: true },
    });
    for (let i = active.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [active[i], active[j]] = [active[j], active[i]];
    }
    return active.slice(0, count).map((row) => row.id);
  }

  /** DM 에 실을 몇 줄. 관심사마다 첫 질문 하나씩 + 포괄 질문. */
  flatten(questions: NetworkQuestions): string[] {
    return [
      ...questions.byInterest.map((group) => group.questions[0]).filter(Boolean),
      ...questions.icebreakers,
    ];
  }

  // ── 운영자: 주제별 질문 ────────────────────────────────────

  async interestSummaries(): Promise<AdminInterestQuestionSummary[]> {
    const interests = await this.prisma.interest.findMany({
      where: { category: { kind: 'INTEREST' }, status: 'ACTIVE' },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      include: { category: { select: { name: true } }, _count: { select: { questions: true } } },
    });
    return interests.map((interest) => ({
      interestId: interest.id,
      interestName: interest.name,
      categoryName: interest.category.name,
      holderCount: interest.holderCount,
      questionCount: interest._count.questions,
    }));
  }

  async listForInterest(interestId: string): Promise<AdminQuestion[]> {
    const rows = await this.prisma.interestQuestion.findMany({
      where: { interestId },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map(this.toAdmin);
  }

  async createForInterest(interestId: string, input: CreateQuestionInput): Promise<AdminQuestion> {
    const interest = await this.prisma.interest.findUnique({ where: { id: interestId } });
    if (!interest) throw new AppError('NOT_FOUND');
    const last = await this.prisma.interestQuestion.aggregate({
      where: { interestId },
      _max: { sortOrder: true },
    });
    const row = await this.prisma.interestQuestion.create({
      data: { interestId, text: input.text.trim(), sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    return this.toAdmin(row);
  }

  async updateInterestQuestion(id: string, input: UpdateQuestionInput): Promise<AdminQuestion> {
    const row = await this.prisma.interestQuestion.findUnique({ where: { id } });
    if (!row) throw new AppError('NOT_FOUND');
    const updated = await this.prisma.interestQuestion.update({
      where: { id },
      data: {
        ...(input.text !== undefined ? { text: input.text.trim() } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    return this.toAdmin(updated);
  }

  async deleteInterestQuestion(id: string): Promise<void> {
    const row = await this.prisma.interestQuestion.findUnique({ where: { id } });
    if (!row) throw new AppError('NOT_FOUND');
    await this.prisma.interestQuestion.delete({ where: { id } });
  }

  // ── 운영자: 포괄 아이스브레이킹 ───────────────────────────

  async listIcebreakers(): Promise<AdminQuestion[]> {
    const rows = await this.prisma.icebreakerQuestion.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => ({ ...this.toAdmin(row), active: row.active }));
  }

  async createIcebreaker(input: CreateQuestionInput): Promise<AdminQuestion> {
    const text = input.text.trim();
    const exists = await this.prisma.icebreakerQuestion.findUnique({ where: { text } });
    if (exists) {
      throw new AppError('VALIDATION_FAILED', undefined, '같은 질문이 이미 있습니다.');
    }
    const last = await this.prisma.icebreakerQuestion.aggregate({ _max: { sortOrder: true } });
    const row = await this.prisma.icebreakerQuestion.create({
      data: { text, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    return { ...this.toAdmin(row), active: row.active };
  }

  async updateIcebreaker(id: string, input: UpdateQuestionInput): Promise<AdminQuestion> {
    const row = await this.prisma.icebreakerQuestion.findUnique({ where: { id } });
    if (!row) throw new AppError('NOT_FOUND');
    if (input.text !== undefined) {
      const dup = await this.prisma.icebreakerQuestion.findUnique({ where: { text: input.text.trim() } });
      if (dup && dup.id !== id) {
        throw new AppError('VALIDATION_FAILED', undefined, '같은 질문이 이미 있습니다.');
      }
    }
    const updated = await this.prisma.icebreakerQuestion.update({
      where: { id },
      data: {
        ...(input.text !== undefined ? { text: input.text.trim() } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
    return { ...this.toAdmin(updated), active: updated.active };
  }

  /** 지운 질문은 이미 성립한 네트워크에서도 사라진다. 잠시 빼고 싶으면 `active=false` 가 맞다. */
  async deleteIcebreaker(id: string): Promise<void> {
    const row = await this.prisma.icebreakerQuestion.findUnique({ where: { id } });
    if (!row) throw new AppError('NOT_FOUND');
    await this.prisma.icebreakerQuestion.delete({ where: { id } });
  }

  private toAdmin(row: { id: string; text: string; sortOrder: number }): AdminQuestion {
    return { id: row.id, text: row.text, sortOrder: row.sortOrder };
  }
}

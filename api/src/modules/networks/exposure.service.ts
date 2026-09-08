import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ParametersService } from '../parameters/parameters.service';

/** "멤버 대부분 겹침" 판정: 작은 쪽 크기의 이 비율 이상이 겹치면 동시 노출하지 않는다(I-10). */
const OVERLAP_RATIO = 2 / 3;

/**
 * 후보 풀에서 실제 노출로 (docs/10 §2a).
 *
 * 핵심은 **후보 풀은 바뀌고 노출된 추천은 고정된다**는 것이다(D-45).
 * 참여는 특정 사람들에 대한 의사 표시이므로, 내가 참여한 그룹의 멤버가
 * 나중에 바뀌면 안 된다. 그래서 노출 시점의 멤버와 공통 관심사를 스냅샷으로 굳힌다.
 */
@Injectable()
export class ExposureService {
  private readonly logger = new Logger(ExposureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parameters: ParametersService,
  ) {}

  /**
   * 빈 슬롯을 우선순위 순으로 채운다.
   * `onlyFor`가 주어지면 그 사용자를 포함하는 후보만 본다(온보딩 즉시 노출).
   */
  async expose(options: { onlyFor?: string; limit?: number } = {}) {
    const [slotLimit, expiryDays] = await Promise.all([
      this.parameters.get('P-19'),
      this.parameters.get('P-10'),
    ]);

    const candidates = await this.prisma.networkCandidate.findMany({
      orderBy: [
        { commonCount: 'desc' },
        { rarityScore: 'desc' },
        { hasNewMember: 'desc' },
        { size: 'asc' },
      ],
    });

    const exposedHashes = new Set(
      (
        await this.prisma.networkRecommendation.findMany({
          select: { memberSetHash: true },
        })
      ).map((row) => row.memberSetHash),
    );

    // 사용자별 현재 열린 추천(슬롯 계산 + 겹침 판정에 쓴다)
    const open = await this.prisma.networkRecommendation.findMany({
      where: { status: 'OPEN', expiresAt: { gt: new Date() } },
      include: { members: { select: { userId: true } } },
    });

    const openByUser = new Map<string, string[][]>();
    for (const recommendation of open) {
      const ids = recommendation.members.map((m) => m.userId);
      for (const id of ids) {
        openByUser.set(id, [...(openByUser.get(id) ?? []), ids]);
      }
    }

    let created = 0;
    const max = options.limit ?? Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      if (created >= max) break;
      if (exposedHashes.has(candidate.memberSetHash)) continue;
      if (options.onlyFor && !candidate.memberIds.includes(options.onlyFor)) {
        continue;
      }

      // 후보 하나가 노출되면 **멤버 전원**에게 동시에 노출된다.
      // 한 사람이라도 슬롯이 꽉 찼으면 그 후보는 대기한다(docs/10 §2a).
      const blocked = candidate.memberIds.some((id) => {
        const mine = openByUser.get(id) ?? [];
        if (mine.length >= slotLimit) return true;
        // 멤버가 대부분 겹치는 추천을 동시에 주지 않는다(docs/10 §7).
        return mine.some((members) => this.mostlyOverlaps(members, candidate.memberIds));
      });
      if (blocked) continue;

      await this.prisma.networkRecommendation.create({
        data: {
          memberSetHash: candidate.memberSetHash,
          commonInterestIds: candidate.commonInterestIds,
          size: candidate.size,
          expiresAt: new Date(Date.now() + expiryDays * 86_400_000),
          members: {
            create: candidate.memberIds.map((userId) => ({ userId })),
          },
        },
      });

      exposedHashes.add(candidate.memberSetHash);
      for (const id of candidate.memberIds) {
        openByUser.set(id, [...(openByUser.get(id) ?? []), candidate.memberIds]);
      }
      created += 1;

      // TODO(M4): 멤버 전원에게 NETWORK_RECOMMENDED 알림.
    }

    if (created > 0) this.logger.log(`추천 ${created}개 노출`);
    return { created };
  }

  private mostlyOverlaps(a: string[], b: string[]): boolean {
    const setB = new Set(b);
    const shared = a.filter((id) => setB.has(id)).length;
    return shared >= Math.ceil(Math.min(a.length, b.length) * OVERLAP_RATIO);
  }
}

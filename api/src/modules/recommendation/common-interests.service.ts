import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface CommonInterestRow {
  userId: string;
  commonCount: number;
  /** 정렬 동점 처리에만 쓴다. 응답에 절대 나가지 않는다(docs/13 원칙 2). */
  rarity: number;
  commonInterestIds: string[];
  createdAt: Date;
}

/**
 * "나와 관심사가 겹치는 사람"을 한 번의 집계로 구한다.
 *
 * 그래프 계층 2(docs/06 §1.1)와 Similar People(docs/13 §3)이 같은 재료를 쓴다.
 * 1,000명 × 평균 7개 = 7,000행이라 매 요청 계산해도 충분하다(design/20 §6.4).
 * 캐시를 두지 않는 이유는 관심사를 바꾸면 즉시 반영되어야 하기 때문이다(NFR-5).
 *
 * 희소성 가중 w(i) = ln(1 + 온보딩완료자수 / 보유자수)  — design/20 §6.2, T-06
 * "가진 사람이 적을수록 큼"만 지키면 되는 자리다(docs/13 §3.2, I-11).
 * 로그를 쓰는 이유는 1명만 가진 관심사가 정렬을 통째로 지배하지 않게 하기 위해서다.
 */
@Injectable()
export class CommonInterestsService {
  constructor(private readonly prisma: PrismaService) {}

  async activeUserCount(): Promise<number> {
    return this.prisma.user.count({ where: { status: 'ACTIVE' } });
  }

  async myInterestIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.userInterest.findMany({
      where: { userId },
      select: { interestId: true },
    });
    return rows.map((row) => row.interestId);
  }

  /**
   * 나와 공통 관심사가 1개 이상인 모든 사용자.
   * 임계값([P-03]) 적용과 상한 자르기는 호출하는 쪽이 한다.
   * 여기서 자르면 그래프의 "관심사당 최소 2명" 보정을 할 수 없다.
   *
   * 속성(층, D-72)은 commonCount와 rarity에 세지 않는다 — 같은 층은 이야깃거리가 아니라
   * 만나기 쉬운 조건이다. 다만 commonInterestIds에는 남겨서 그래프가 층 노드를 그리고
   * "노드당 최소 2명" 보정이 같은 층 사람을 데려올 수 있게 한다.
   * 그래서 속성만 겹치는 사람은 commonCount 0으로 돌아온다.
   */
  async findOverlapping(
    meId: string,
    myInterestIds: string[],
    activeUsers: number,
  ): Promise<CommonInterestRow[]> {
    if (myInterestIds.length === 0) return [];

    const rows = await this.prisma.$queryRaw<
      {
        userId: string;
        commonCount: number;
        rarity: number;
        commonInterestIds: string[];
        createdAt: Date;
      }[]
    >(Prisma.sql`
      SELECT
        ui.user_id                                        AS "userId",
        count(*) FILTER (WHERE c.kind = 'INTEREST')::int  AS "commonCount",
        COALESCE(sum(ln(1 + ${activeUsers}::float
                 / GREATEST(i.holder_count, 1)))
                 FILTER (WHERE c.kind = 'INTEREST'), 0)::float AS "rarity",
        array_agg(ui.interest_id)                         AS "commonInterestIds",
        u.created_at                                      AS "createdAt"
      FROM user_interest ui
      JOIN interest i  ON i.id = ui.interest_id
      JOIN category c  ON c.id = i.category_id
      JOIN "user" u    ON u.id = ui.user_id
      WHERE ui.interest_id IN (${Prisma.join(myInterestIds)})
        AND ui.user_id <> ${meId}
        AND u.status = 'ACTIVE'
      GROUP BY ui.user_id, u.created_at
    `);

    return rows;
  }

  /**
   * 정렬 규칙 (docs/13 §3.1):
   *   1차 공통 관심사 개수 → 2차 희소성 가중 합 → 3차 최근 가입
   * 화면에 이 순서를 그대로 문장으로 적는다(원칙 4). 사용자가 순서를 예측할 수 있어야 한다.
   */
  sort(rows: CommonInterestRow[]): CommonInterestRow[] {
    return [...rows].sort(
      (a, b) =>
        b.commonCount - a.commonCount ||
        b.rarity - a.rarity ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }
}

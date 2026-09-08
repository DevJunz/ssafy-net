import { Injectable } from '@nestjs/common';
import type { RequestQuota } from '@ssafy-net/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ParametersService } from '../parameters/parameters.service';

/**
 * 요청 횟수 상한과 감속 (docs/09 §3).
 *
 * 차단 기능이 없으므로(D-48) 이 장치들이 받는 쪽을 지키는 주된 수단이다(R-06).
 *
 * 카운터를 컬럼으로 캐시하지 않고 매번 센다. 규칙이 바뀔 예정이고(A-25, A-41),
 * 카운터가 실제 행과 어긋나면 원인을 찾을 수 없다(design/21 §4.4).
 *
 * 기준 시각은 KST 달력이다 — 화면 문구가 "내일 다시"이므로 달력 하루여야
 * 사용자가 예측할 수 있다(D-60 후보).
 */
@Injectable()
export class QuotaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parameters: ParametersService,
  ) {}

  private startOfDay(now = new Date()): Date {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private startOfWeek(now = new Date()): Date {
    const date = this.startOfDay(now);
    // 월요일 시작. 일요일(0)은 6일 전이 월요일이다.
    const offset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - offset);
    return date;
  }

  private nextMidnight(now = new Date()): Date {
    const date = this.startOfDay(now);
    date.setDate(date.getDate() + 1);
    return date;
  }

  async quota(userId: string): Promise<RequestQuota> {
    const [baseDaily, weeklyLimit, minSent, threshold, throttledLimit] =
      await Promise.all([
        this.parameters.get('P-06d'),
        this.parameters.get('P-06w'),
        this.parameters.get('P-20'),
        this.parameters.get('P-21'),
        this.parameters.get('P-22'),
      ]);

    const [dailyUsed, weeklyUsed, sent, accepted] = await Promise.all([
      // 취소한 요청도 센다. 취소로 상한을 우회하지 못한다(docs/09 §3).
      this.prisma.connectionRequest.count({
        where: { requesterId: userId, createdAt: { gte: this.startOfDay() } },
      }),
      this.prisma.connectionRequest.count({
        where: { requesterId: userId, createdAt: { gte: this.startOfWeek() } },
      }),
      this.prisma.connectionRequest.count({
        where: { requesterId: userId, status: { not: 'CANCELLED' } },
      }),
      this.prisma.connectionRequest.count({
        where: { requesterId: userId, status: 'ACCEPTED' },
      }),
    ]);

    // 수락률 기반 감속: 보낸 요청이 충분히 쌓였는데 수락률이 낮으면 일일 상한을 낮춘다.
    const throttled =
      sent >= minSent && (accepted / sent) * 100 < threshold;

    return {
      dailyLimit: throttled ? throttledLimit : baseDaily,
      dailyUsed,
      weeklyLimit,
      weeklyUsed,
      throttled,
      resetAt: this.nextMidnight().toISOString(),
    };
  }
}

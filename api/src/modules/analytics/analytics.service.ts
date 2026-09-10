import { Injectable, Logger } from '@nestjs/common';
import { CLIENT_EVENTS, type EventName, type ServerEventName } from '@ssafy-net/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

const MAX_BATCH = 50;
const MAX_PROPS_CHARS = 2000;
const CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

const CLIENT_EVENT_SET = new Set<string>(CLIENT_EVENTS);

/**
 * 측정 이벤트 (design/20 §10, design/22 §14). `analytics_event` 표 하나에 이름 + props 로 쌓는다.
 *
 * 서버가 보는 것은 서버가 남긴다(`track`). 컨트롤러에서 응답을 붙잡지 않도록 fire-and-forget 이다 —
 * 기록에 실패해도 요청은 성공한다. 프론트는 서버가 볼 수 없는 클릭만 `ingest` 로 보낸다.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 서버가 본 사건. 응답을 기다리지 않는다. */
  track(
    name: ServerEventName,
    userId: string | null,
    props?: Record<string, unknown>,
  ): void {
    void this.prisma.analyticsEvent
      .create({
        data: {
          name,
          userId,
          props: (props ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      })
      .catch((error: unknown) => {
        this.logger.warn(`이벤트 기록 실패 ${name}: ${String(error)}`);
      });
  }

  /**
   * 프론트가 보낸 묶음. 이름은 CLIENT_EVENTS 안의 것만 받는다 — 서버 목록의 이름을 보내면 버린다(중복 방지).
   * 시각은 하루 넘게 어긋나면 서버 시각으로 바꾼다.
   */
  async ingest(
    userId: string,
    input: {
      events: { name: string; props?: Record<string, unknown>; occurredAt?: string }[];
      sessionId?: string;
    },
  ): Promise<{ accepted: number; dropped: number }> {
    const now = Date.now();
    const rows: Prisma.AnalyticsEventCreateManyInput[] = [];
    let dropped = 0;

    for (const event of input.events.slice(0, MAX_BATCH)) {
      if (!CLIENT_EVENT_SET.has(event.name)) {
        dropped += 1;
        continue;
      }
      let props = event.props;
      if (props && JSON.stringify(props).length > MAX_PROPS_CHARS) props = undefined;

      const parsed = event.occurredAt ? Date.parse(event.occurredAt) : NaN;
      const occurredAt =
        Number.isFinite(parsed) && Math.abs(parsed - now) < CLOCK_SKEW_MS
          ? new Date(parsed)
          : new Date(now);

      rows.push({
        name: event.name as EventName,
        userId,
        props: props as Prisma.InputJsonValue | undefined,
        sessionId: input.sessionId?.slice(0, 64),
        occurredAt,
      });
    }
    dropped += Math.max(0, input.events.length - MAX_BATCH);

    if (rows.length > 0) {
      await this.prisma.analyticsEvent.createMany({ data: rows });
    }
    return { accepted: rows.length, dropped };
  }
}

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  OpsCommonBucket,
  OpsCreatedInterest,
  OpsDayCount,
  OpsEntryStat,
  OpsJob,
  OpsMetrics,
  OpsAnnouncement,
  OpsAnnounceResult,
  OpsNetworkPreview,
  OpsNetworkSwitchResult,
  OpsOperator,
  OpsParameterUpdateResult,
  OpsRequestDay,
  OpsRequestEntry,
} from '@ssafy-net/shared';
import {
  OPS_EDITABLE_PARAMETERS,
  type OpsEditableParameterKey,
} from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { StatsService } from '../../common/stats.service';
import { JobsService } from '../../jobs/jobs.service';
import { CandidateService } from '../networks/candidate.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MattermostService } from '../../infra/mattermost/mattermost.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CREATE_PER_DAY } from '../interests/interests.service';
import { ParametersService } from '../parameters/parameters.service';
import { UserPresenter } from '../users/user.presenter';

/**
 * 운영자 대시보드 지표 (D-77). PM 블록은 docs/14 §4·§5, 서버 블록은 design/23 의 "조용히 죽는 곳" 순서다.
 *
 * 계산 원칙
 * - 날짜 경계는 KST 달력이다(D-60). Prisma 의 DateTime 은 tz 없는 UTC 로 저장되므로 SQL 에서는
 *   `+ interval '9 hours'` 로 옮긴다(KST 는 DST 가 없다). JS 에서는 `kstDay()`.
 * - 표에 상태로 남는 것(요청·연결·후속 확인·Network)은 표에서 세고, 열람·클릭만 `analytics_event` 에서 센다.
 * - 원시 SQL 은 컬럼 이름을 아는 표(analytics_event, notification, notification_delivery)에만 쓴다.
 *   나머지는 Prisma 로 읽어 JS 에서 묶는다 — 2주 규모에서 행 수가 수천이라 충분하다(design/23 §2).
 * - 실명은 나가지 않는다. 사용자는 표시명과 id 뿐이다(design/20 §11).
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const KST_OFFSET_MS = 9 * HOUR_MS;
const STUCK_QUEUED_MINUTES = 30;
const PROCESS_STARTED_AT = new Date();

const JOB_SCHEDULES: { name: string; schedule: string; staleAfterHours: number }[] = [
  { name: 'request.expire', schedule: '10분마다', staleAfterHours: 1 },
  { name: 'request.expiry-remind', schedule: '매시', staleAfterHours: 3 },
  { name: 'connection.initiator-remind', schedule: '매시', staleAfterHours: 3 },
  { name: 'connection.follow-up', schedule: '매시', staleAfterHours: 3 },
  { name: 'network.recompute', schedule: '09:00 · 18:00', staleAfterHours: 13 },
  { name: 'network.expire', schedule: '매시', staleAfterHours: 3 },
  { name: 'network.expiry-remind', schedule: '매시', staleAfterHours: 3 },
  { name: 'network.initiator-remind', schedule: '매시', staleAfterHours: 3 },
  { name: 'gate.evaluate', schedule: '09:05', staleAfterHours: 26 },
  { name: 'digest.send', schedule: '09:00', staleAfterHours: 26 },
];

const ENTRIES: OpsRequestEntry[] = [
  'SIMILAR',
  'INTEREST_DETAIL',
  'PROFILE',
  'POST',
  'GRAPH',
  'NETWORK_FAILED',
];

/** KST 달력 날짜 `YYYY-MM-DD`. */
function kstDay(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** KST 자정(UTC 시각으로). */
function startOfKstDay(now: Date): Date {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - KST_OFFSET_MS);
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function mb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function num(value: unknown): number {
  return typeof value === 'bigint' ? Number(value) : Number(value ?? 0);
}

interface DayRow {
  day: string;
  n: unknown;
}

@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parameters: ParametersService,
    private readonly presenter: UserPresenter,
    private readonly stats: StatsService,
    private readonly mattermost: MattermostService,
    private readonly config: ConfigService,
    private readonly candidates: CandidateService,
    // 지표 헬퍼 jobs()·notifications() 와 이름이 겹쳐 다르게 부른다.
    private readonly jobRunner: JobsService,
    private readonly notifier: NotificationsService,
  ) {}

  async metrics(days: number): Promise<OpsMetrics> {
    const now = new Date();
    const todayStart = startOfKstDay(now);
    const since = new Date(todayStart.getTime() - (days - 1) * DAY_MS);
    const dayKeys = Array.from({ length: days }, (_, i) =>
      kstDay(new Date(since.getTime() + i * DAY_MS)),
    );
    const ctx: Ctx = { now, todayStart, since, days, dayKeys };

    const [
      northStar,
      requests,
      guardrail,
      onboarding,
      interests,
      exploration,
      activity,
      notifications,
      network,
      db,
      deliveries,
      jobs,
      backups,
      abuse,
    ] = await Promise.all([
      this.northStar(ctx),
      this.requests(ctx),
      this.guardrail(ctx),
      this.onboarding(ctx),
      this.interests(ctx),
      this.exploration(ctx),
      this.activity(ctx),
      this.notifications(ctx),
      this.network(),
      this.db(),
      this.deliveries(ctx),
      this.jobs(now),
      this.backups(),
      this.abuse(ctx),
    ]);

    const { requesters, ...requestsOut } = requests;
    const { profileViewers, ...explorationOut } = exploration;

    // 길별 전환율은 열람(exploration)과 요청(requests)을 합쳐야 나온다.
    const viewsByEntry: Record<OpsRequestEntry, number | null> = {
      SIMILAR: exploration.views.similar,
      INTEREST_DETAIL: exploration.views.interestDetail,
      PROFILE: exploration.views.profile,
      POST: null,
      GRAPH: exploration.views.graphMe + exploration.views.graphInterest,
      NETWORK_FAILED: null,
    };
    const byEntry: OpsEntryStat[] = requests.byEntry.map((entry) => {
      const views = viewsByEntry[entry.entry];
      return {
        ...entry,
        views,
        conversion: views === null ? null : rate(entry.sent, views),
      };
    });

    const memory = process.memoryUsage();

    return {
      generatedAt: now.toISOString(),
      days,
      product: {
        northStar,
        requests: { ...requestsOut, byEntry, maxSentToday: abuse.maxSentToday },
        guardrail,
        onboarding,
        interests,
        exploration: {
          ...explorationOut,
          // 요청은 프로필 패널에서 나가므로 보통 1 이하다. 기록 시작 전의 요청이 섞이면 넘을 수 있어 자른다.
          requesterRate: profileViewers === 0 ? null : Math.min(1, requesters / profileViewers),
        },
        activity,
        notifications,
        network,
      },
      server: {
        process: {
          startedAt: PROCESS_STARTED_AT.toISOString(),
          uptimeSec: Math.round(process.uptime()),
          nodeVersion: process.version,
          rssMb: mb(memory.rss),
          heapUsedMb: mb(memory.heapUsed),
        },
        host: {
          totalMemMb: mb(os.totalmem()),
          freeMemMb: mb(os.freemem()),
          loadAvg: os.loadavg().map((v) => Math.round(v * 100) / 100),
          cpus: os.cpus().length,
        },
        db,
        http: this.stats.http(),
        webhook: this.stats.webhook(),
        deliveries,
        jobs,
        backups,
        abuse,
        mode: {
          nodeEnv: process.env.NODE_ENV ?? 'development',
          deliveryMode: this.mattermost.deliveryMode,
          allowListSize: (this.config.get<string>('MATTERMOST_ALLOWED_RECIPIENTS') ?? '')
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean).length,
        },
      },
    };
  }

  // ───────────────────────────────────────────── 제품

  /** North Star: 신규 성립 연결 수. 1:1 = 1, Network 성립 = 참여 인원(docs/14 §4). */
  private async northStar(ctx: Ctx): Promise<OpsMetrics['product']['northStar']> {
    const [connections, networks, allConnections, allNetworkMembers] = await Promise.all([
      this.prisma.connection.findMany({
        where: { establishedAt: { gte: ctx.since } },
        select: { establishedAt: true },
      }),
      this.prisma.networkRecommendation.findMany({
        where: { status: 'ACTIVATED', activatedAt: { gte: ctx.since } },
        select: { activatedAt: true, _count: { select: { members: { where: { decision: 'JOINED' } } } } },
      }),
      this.prisma.connection.count(),
      this.prisma.networkMember.count({
        where: { decision: 'JOINED', recommendation: { status: 'ACTIVATED' } },
      }),
    ]);

    const counts = new Map<string, number>(ctx.dayKeys.map((day) => [day, 0]));
    const bump = (date: Date | null, weight: number) => {
      if (!date) return;
      const day = kstDay(date);
      if (counts.has(day)) counts.set(day, (counts.get(day) ?? 0) + weight);
    };
    for (const c of connections) bump(c.establishedAt, 1);
    for (const n of networks) bump(n.activatedAt, n._count.members);

    const byDay: OpsDayCount[] = ctx.dayKeys.map((day) => ({ day, count: counts.get(day) ?? 0 }));
    const today = kstDay(ctx.now);
    const yesterday = kstDay(new Date(ctx.now.getTime() - DAY_MS));
    return {
      byDay,
      windowTotal: byDay.reduce((sum, d) => sum + d.count, 0),
      today: counts.get(today) ?? 0,
      yesterday: counts.get(yesterday) ?? 0,
      allTime: allConnections + allNetworkMembers,
    };
  }

  private async requests(ctx: Ctx) {
    const [rows, pending] = await Promise.all([
      this.prisma.connectionRequest.findMany({
        where: {
          OR: [
            { createdAt: { gte: ctx.since } },
            { respondedAt: { gte: ctx.since } },
            { expiredAt: { gte: ctx.since } },
            { cancelledAt: { gte: ctx.since } },
          ],
        },
        select: {
          requesterId: true,
          status: true,
          entryPoint: true,
          commonInterestIds: true,
          createdAt: true,
          respondedAt: true,
          expiredAt: true,
          cancelledAt: true,
        },
      }),
      this.prisma.connectionRequest.count({ where: { status: 'PENDING' } }),
    ]);

    const byDayMap = new Map<string, OpsRequestDay>(
      ctx.dayKeys.map((day) => [
        day,
        { day, sent: 0, accepted: 0, rejected: 0, expired: 0, cancelled: 0 },
      ]),
    );
    const at = (date: Date | null) => (date ? byDayMap.get(kstDay(date)) : undefined);

    const totals = { sent: 0, accepted: 0, rejected: 0, expired: 0, cancelled: 0, pending };
    const entryMap = new Map<OpsRequestEntry, { sent: number; accepted: number; closed: number }>(
      ENTRIES.map((entry) => [entry, { sent: 0, accepted: 0, closed: 0 }]),
    );
    const buckets: Record<OpsCommonBucket['bucket'], OpsCommonBucket> = {
      '0': { bucket: '0', sent: 0, accepted: 0 },
      '1-2': { bucket: '1-2', sent: 0, accepted: 0 },
      '3-4': { bucket: '3-4', sent: 0, accepted: 0 },
      '5+': { bucket: '5+', sent: 0, accepted: 0 },
    };
    const requesters = new Set<string>();

    for (const row of rows) {
      const inWindow = row.createdAt >= ctx.since;
      const sentDay = at(row.createdAt);
      if (sentDay) sentDay.sent += 1;
      if (row.status === 'ACCEPTED') {
        const d = at(row.respondedAt);
        if (d) d.accepted += 1;
      } else if (row.status === 'REJECTED') {
        const d = at(row.respondedAt);
        if (d) d.rejected += 1;
      } else if (row.status === 'EXPIRED') {
        const d = at(row.expiredAt);
        if (d) d.expired += 1;
      } else if (row.status === 'CANCELLED') {
        const d = at(row.cancelledAt);
        if (d) d.cancelled += 1;
      }

      if (!inWindow) continue;
      requesters.add(row.requesterId);
      totals.sent += 1;
      if (row.status === 'ACCEPTED') totals.accepted += 1;
      if (row.status === 'REJECTED') totals.rejected += 1;
      if (row.status === 'EXPIRED') totals.expired += 1;
      if (row.status === 'CANCELLED') totals.cancelled += 1;

      const entry = entryMap.get(row.entryPoint as OpsRequestEntry);
      if (entry) {
        entry.sent += 1;
        if (row.status === 'ACCEPTED') entry.accepted += 1;
        if (['ACCEPTED', 'REJECTED', 'EXPIRED'].includes(row.status)) entry.closed += 1;
      }

      const common = row.commonInterestIds.length;
      const bucket =
        common === 0 ? buckets['0'] : common <= 2 ? buckets['1-2'] : common <= 4 ? buckets['3-4'] : buckets['5+'];
      bucket.sent += 1;
      if (row.status === 'ACCEPTED') bucket.accepted += 1;
    }

    const byEntry: OpsEntryStat[] = ENTRIES.map((entry) => {
      const stat = entryMap.get(entry)!;
      return {
        entry,
        sent: stat.sent,
        accepted: stat.accepted,
        acceptRate: rate(stat.accepted, stat.closed),
        views: null,
        conversion: null,
      };
    });

    return {
      byDay: ctx.dayKeys.map((day) => byDayMap.get(day)!),
      totals,
      acceptRate: rate(totals.accepted, totals.accepted + totals.rejected + totals.expired),
      byEntry,
      byCommonCount: Object.values(buckets),
      requesters: requesters.size,
    };
  }

  /** 가드레일: "대화 시작" 응답 비율 ≥ 50% (docs/14 §4). */
  private async guardrail(ctx: Ctx): Promise<OpsMetrics['product']['guardrail']> {
    const rows = await this.prisma.followUpCheck.findMany({
      where: { askedAt: { gte: ctx.since } },
      select: { respondedAt: true, started: true },
    });
    const responded = rows.filter((r) => r.respondedAt !== null);
    const started = responded.filter((r) => r.started === true).length;
    return {
      asked: rows.length,
      responded: responded.length,
      started,
      startedRate: rate(started, responded.length),
      responseRate: rate(responded.length, rows.length),
    };
  }

  private async onboarding(ctx: Ctx): Promise<OpsMetrics['product']['onboarding']> {
    const [users, stuck, activeNickname, active, verifications] = await Promise.all([
      this.prisma.user.findMany({
        where: { createdAt: { gte: ctx.since } },
        select: {
          createdAt: true,
          onboardedAt: true,
          mattermostVerifiedAt: true,
          status: true,
        },
      }),
      this.prisma.user.count({
        where: { status: 'ONBOARDING', createdAt: { lt: new Date(ctx.now.getTime() - DAY_MS) } },
      }),
      this.prisma.user.count({ where: { status: 'ACTIVE', displayNameType: 'NICKNAME' } }),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.mattermostVerification.findMany({
        where: { createdAt: { gte: ctx.since } },
        select: { usedAt: true },
      }),
    ]);

    const byDayMap = new Map(ctx.dayKeys.map((day) => [day, { day, signedUp: 0, completed: 0 }]));
    for (const u of users) {
      const s = byDayMap.get(kstDay(u.createdAt));
      if (s) s.signedUp += 1;
      if (u.onboardedAt) {
        const c = byDayMap.get(kstDay(u.onboardedAt));
        if (c) c.completed += 1;
      }
    }

    return {
      signedUp: users.length,
      verified: users.filter((u) => u.mattermostVerifiedAt !== null).length,
      completed: users.filter((u) => u.onboardedAt !== null).length,
      withdrawn: users.filter((u) => u.status === 'WITHDRAWN').length,
      stuck,
      verificationsSent: verifications.length,
      verificationsUsed: verifications.filter((v) => v.usedAt !== null).length,
      byDay: ctx.dayKeys.map((day) => byDayMap.get(day)!),
      nicknameRate: rate(activeNickname, active),
    };
  }

  private async interests(ctx: Ctx): Promise<OpsMetrics['product']['interests']> {
    const [statusCounts, userCreated, created, top, changes, changedUsers, createdToday] =
      await Promise.all([
        this.prisma.interest.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.interest.count({ where: { createdById: { not: null } } }),
        this.prisma.interest.findMany({
          where: { createdById: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: { category: { select: { name: true } }, createdBy: true },
        }),
        this.prisma.interest.findMany({
          where: { status: 'ACTIVE', category: { kind: 'INTEREST' } },
          orderBy: { holderCount: 'desc' },
          take: 10,
          select: { id: true, name: true, holderCount: true },
        }),
        this.prisma.userInterestChange.groupBy({
          by: ['action'],
          where: { changedAt: { gte: ctx.since } },
          _count: { _all: true },
        }),
        this.prisma.userInterestChange.findMany({
          where: { changedAt: { gte: ctx.since } },
          distinct: ['userId'],
          select: { userId: true },
        }),
        this.prisma.interest.groupBy({
          by: ['createdById'],
          where: { createdById: { not: null }, createdAt: { gte: ctx.todayStart } },
          _count: { _all: true },
        }),
      ]);

    // 만든 사람이 실제로 그 관심사를 가졌는지. 안 가졌으면 others = holderCount.
    const creatorHolds = new Set<string>();
    if (created.length > 0) {
      const holdings = await this.prisma.userInterest.findMany({
        where: {
          OR: created
            .filter((i) => i.createdById)
            .map((i) => ({ interestId: i.id, userId: i.createdById! })),
        },
        select: { interestId: true },
      });
      for (const h of holdings) creatorHolds.add(h.interestId);
    }

    const createdList: OpsCreatedInterest[] = created.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category.name,
      createdAt: i.createdAt.toISOString(),
      creator: i.createdBy
        ? { id: i.createdBy.id, displayName: this.presenter.displayName(i.createdBy) }
        : null,
      holderCount: i.holderCount,
      others: Math.max(0, i.holderCount - (creatorHolds.has(i.id) ? 1 : 0)),
      status: i.status,
    }));

    const byCategory = new Map<string, number>();
    for (const i of created) byCategory.set(i.category.name, (byCategory.get(i.category.name) ?? 0) + 1);

    const count = (status: 'ACTIVE' | 'HIDDEN' | 'MERGED') =>
      statusCounts.find((s) => s.status === status)?._count._all ?? 0;
    const change = (action: 'ADD' | 'REMOVE') =>
      changes.find((c) => c.action === action)?._count._all ?? 0;

    return {
      totalActive: count('ACTIVE'),
      userCreated,
      hidden: count('HIDDEN'),
      merged: count('MERGED'),
      created: createdList,
      createdByCategory: [...byCategory.entries()]
        .map(([category, n]) => ({ category, count: n }))
        .sort((a, b) => b.count - a.count),
      topByHolders: top,
      changes: { added: change('ADD'), removed: change('REMOVE'), users: changedUsers.length },
      createCapReachedToday: createdToday.filter((g) => g._count._all >= CREATE_PER_DAY).length,
    };
  }

  private async exploration(ctx: Ctx) {
    const [counts, multi, byDayRows, anchors, profileViewers] = await Promise.all([
      this.prisma.analyticsEvent.groupBy({
        by: ['name'],
        where: { occurredAt: { gte: ctx.since } },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ n: unknown }[]>`
        SELECT count(*) AS n FROM analytics_event
        WHERE name = 'graph.view' AND occurred_at >= ${ctx.since}
          AND (props->>'interestCount')::int >= 2`,
      this.prisma.$queryRaw<{ day: string; name: string; n: unknown }[]>`
        SELECT to_char(occurred_at + interval '9 hours', 'YYYY-MM-DD') AS day, name, count(*) AS n
        FROM analytics_event
        WHERE occurred_at >= ${ctx.since} AND name IN ('graph.view', 'graph.similar_mode', 'profile.view')
        GROUP BY 1, 2`,
      this.prisma.$queryRaw<{ id: string; n: unknown }[]>`
        SELECT e.id AS id, count(*) AS n
        FROM analytics_event, jsonb_array_elements_text(props->'interestIds') AS e(id)
        WHERE name = 'graph.view' AND occurred_at >= ${ctx.since}
        GROUP BY e.id ORDER BY n DESC LIMIT 10`,
      this.prisma.$queryRaw<{ n: unknown }[]>`
        SELECT count(DISTINCT user_id) AS n FROM analytics_event
        WHERE name = 'profile.view' AND occurred_at >= ${ctx.since}`,
    ]);

    const of = (name: string) => counts.find((c) => c.name === name)?._count._all ?? 0;
    const graphViewsByAnchor = await this.prisma.$queryRaw<{ anchor: string; n: unknown }[]>`
      SELECT props->>'anchor' AS anchor, count(*) AS n FROM analytics_event
      WHERE name = 'graph.view' AND occurred_at >= ${ctx.since} GROUP BY 1`;
    const anchorCount = (anchor: string) => num(graphViewsByAnchor.find((r) => r.anchor === anchor)?.n);
    // 켜는 것은 서버가, 끄는 것은 프론트가 남긴다. 켠 횟수 = 열람.
    const similarOn = await this.prisma.analyticsEvent.count({
      where: {
        name: 'graph.similar_mode',
        occurredAt: { gte: ctx.since },
        props: { path: ['on'], equals: true },
      },
    });

    const byDayMap = new Map(ctx.dayKeys.map((day) => [day, { day, graph: 0, similar: 0, profile: 0 }]));
    for (const row of byDayRows) {
      const d = byDayMap.get(row.day);
      if (!d) continue;
      if (row.name === 'graph.view') d.graph += num(row.n);
      else if (row.name === 'graph.similar_mode') d.similar += num(row.n);
      else if (row.name === 'profile.view') d.profile += num(row.n);
    }

    const anchorNames = anchors.length
      ? await this.prisma.interest.findMany({
          where: { id: { in: anchors.map((a) => a.id) } },
          select: { id: true, name: true },
        })
      : [];
    const active = await this.prisma.user.count({ where: { status: 'ACTIVE' } });
    const viewers = num(profileViewers[0]?.n);

    return {
      views: {
        graphMe: anchorCount('me'),
        graphInterest: anchorCount('interest'),
        graphMulti: num(multi[0]?.n),
        similar: similarOn,
        profile: of('profile.view'),
        interestDetail: of('interest.detail_view'),
        interestPeople: of('interest.people_view'),
      },
      byDay: ctx.dayKeys.map((day) => byDayMap.get(day)!),
      clicks: {
        interest: of('graph.interest_click'),
        person: of('graph.person_click'),
        anchorChange: of('graph.anchor_change'),
        background: of('graph.background_click'),
        similarOff: of('graph.similar_mode') - similarOn,
      },
      topAnchors: anchors.map((a) => ({
        id: a.id,
        name: anchorNames.find((n) => n.id === a.id)?.name ?? '(삭제됨)',
        count: num(a.n),
      })),
      profileViewerRate: rate(viewers, active),
      profileViewers: viewers,
    };
  }

  private async activity(ctx: Ctx): Promise<OpsMetrics['product']['activity']> {
    const weekAgo = new Date(ctx.now.getTime() - 7 * DAY_MS);
    const [hours, weekdays, dauRows, activeToday, wau, first, week2] = await Promise.all([
      this.prisma.$queryRaw<{ h: number; n: unknown }[]>`
        SELECT extract(hour FROM occurred_at + interval '9 hours')::int AS h, count(*) AS n
        FROM analytics_event WHERE name = 'graph.view' AND occurred_at >= ${ctx.since} GROUP BY 1`,
      this.prisma.$queryRaw<{ d: number; n: unknown }[]>`
        SELECT extract(isodow FROM occurred_at + interval '9 hours')::int AS d, count(*) AS n
        FROM analytics_event WHERE name = 'graph.view' AND occurred_at >= ${ctx.since} GROUP BY 1`,
      this.prisma.$queryRaw<DayRow[]>`
        SELECT to_char(occurred_at + interval '9 hours', 'YYYY-MM-DD') AS day, count(DISTINCT user_id) AS n
        FROM analytics_event WHERE occurred_at >= ${ctx.since} AND user_id IS NOT NULL GROUP BY 1`,
      this.prisma.user.count({ where: { lastSeenAt: { gte: ctx.todayStart } } }),
      this.prisma.user.count({ where: { lastSeenAt: { gte: weekAgo } } }),
      this.prisma.analyticsEvent.findFirst({ orderBy: { occurredAt: 'asc' }, select: { occurredAt: true } }),
      this.prisma.user.findMany({
        where: { status: 'ACTIVE', onboardedAt: { lte: new Date(ctx.now.getTime() - 8 * DAY_MS) } },
        select: { onboardedAt: true, lastSeenAt: true },
      }),
    ]);

    const hourOfDay = Array.from({ length: 24 }, (_, h) => num(hours.find((r) => r.h === h)?.n));
    // isodow: 월=1 … 일=7 → 0..6
    const weekday = Array.from({ length: 7 }, (_, i) => num(weekdays.find((r) => r.d === i + 1)?.n));
    const dauMap = new Map(dauRows.map((r) => [r.day, num(r.n)]));

    const returned = week2.filter(
      (u) => u.onboardedAt && u.lastSeenAt && u.lastSeenAt.getTime() >= u.onboardedAt.getTime() + 8 * DAY_MS,
    ).length;

    return {
      hourOfDay,
      weekday,
      dau: ctx.dayKeys.map((day) => ({ day, count: dauMap.get(day) ?? 0 })),
      activeToday,
      wau,
      week2Return: { eligible: week2.length, returned, rate: rate(returned, week2.length) },
      trackingSince: first?.occurredAt.toISOString() ?? null,
    };
  }

  private async notifications(ctx: Ctx): Promise<OpsMetrics['product']['notifications']> {
    const rows = await this.prisma.$queryRaw<{ type: string; sent: unknown; clicked: unknown }[]>`
      SELECT n.type AS type,
             count(*) FILTER (WHERE d.status = 'SENT') AS sent,
             count(*) FILTER (WHERE d.clicked_at IS NOT NULL) AS clicked
      FROM notification_delivery d JOIN notification n ON n.id = d.notification_id
      WHERE d.channel = 'MATTERMOST' AND n.created_at >= ${ctx.since}
      GROUP BY n.type ORDER BY sent DESC`;
    const byType = rows.map((r) => ({
      type: r.type,
      sent: num(r.sent),
      clicked: num(r.clicked),
      clickRate: rate(num(r.clicked), num(r.sent)),
    }));
    const digest = byType.find((t) => t.type === 'DIGEST');
    return {
      byType,
      digest: {
        sent: digest?.sent ?? 0,
        clicked: digest?.clicked ?? 0,
        clickRate: digest?.clickRate ?? null,
      },
    };
  }

  private async network(): Promise<OpsMetrics['product']['network']> {
    const [enabled, gate, candidates, statuses, decisions, minCommon, minInterests] =
      await Promise.all([
        this.parameters.flag('network_enabled'),
        this.candidates.evaluateGate(),
        this.prisma.networkCandidate.count(),
        this.prisma.networkRecommendation.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.networkMember.groupBy({ by: ['decision'], _count: { _all: true } }),
        this.parameters.get('P-04'),
        this.parameters.get('P-01'),
      ]);
    const status = (s: 'OPEN' | 'ACTIVATED' | 'EXPIRED' | 'DISSOLVED') =>
      statuses.find((r) => r.status === s)?._count._all ?? 0;
    const decision = (d: 'JOINED' | 'DECLINED') =>
      decisions.find((r) => r.decision === d)?._count._all ?? 0;
    return {
      enabled,
      gate: { activeUsers: gate.activeUsers, perUser: gate.perUser, passes: gate.passes },
      thresholds: { minCommon, minInterests },
      candidates,
      open: status('OPEN'),
      activated: status('ACTIVATED'),
      expired: status('EXPIRED'),
      dissolved: status('DISSOLVED'),
      joined: decision('JOINED'),
      declined: decision('DECLINED'),
    };
  }

  // ───────────────────────────────────────────── 레버 (D-78, D-79)

  /**
   * Network 추천을 켜고 끈다(D-78). 켜면 배치 시각을 기다리지 않고 후보 재계산과 빈 슬롯 노출을 지금 돌리고,
   * 처음 켜는 것이면 온보딩을 마친 전원에게 "네트워크 추천이 시작되었습니다" 를 보낸다(docs/10 §4).
   * dedupeKey 가 있어 껐다 켜도 사용자당 한 번이다. 끄면 새 노출만 멈춘다 — 후보 계산은 계속 돈다(D-75).
   */
  async setNetworkEnabled(enabled: boolean): Promise<OpsNetworkSwitchResult> {
    const before = await this.parameters.flag('network_enabled');
    await this.parameters.setFlag('network_enabled', enabled);
    if (!enabled) return { enabled: false, candidates: 0, exposed: 0, notified: 0 };

    // 잡으로 돌려야 서버 탭의 "마지막 실행" 에 남는다. 캐시는 setFlag 가 비웠으므로 노출 단계가 켜진 값을 본다.
    const run = (await this.jobRunner.runNow('network.recompute')) as
      | { candidates?: number; exposed?: number }
      | null;

    let notified = 0;
    if (!before) {
      // 껐다 다시 켜도 이미 받은 사람에게는 안 간다(dedupeKey 와 같은 규칙). 세는 값도 실제 대상만.
      const already = await this.prisma.notification.findMany({
        where: { type: 'NETWORK_ENABLED' },
        select: { userId: true },
      });
      const users = await this.prisma.user.findMany({
        where: { status: 'ACTIVE', id: { notIn: already.map((n) => n.userId) } },
        select: { id: true },
      });
      for (const user of users) {
        await this.notifier.notify({
          userId: user.id,
          type: 'NETWORK_ENABLED',
          payload: {},
          targetPath: '/networks?tab=recommended',
          dedupeKey: 'network-enabled',
        });
        notified += 1;
      }
    }

    return {
      enabled: true,
      candidates: run?.candidates ?? 0,
      exposed: run?.exposed ?? 0,
      notified,
    };
  }

  /**
   * 후보 기준값을 바꾸기 전에 실데이터로 미리 본다(D-91).
   * 저장하는 것이 없다 — `network_candidate` 는 그대로다.
   */
  networkPreview(): Promise<OpsNetworkPreview> {
    return this.candidates.preview();
  }

  /**
   * 파라미터 값을 바꾼다(D-91). `/ops` 의 Network 구역에서 P-04·P-01 두 개만 연다.
   *
   * 저장하면 그 자리에서 `network.recompute` 를 돌린다 — 배치 시각(09·18시)을 기다리면
   * 바꾼 값이 맞는지 반나절 뒤에야 안다. 잡으로 돌려야 서버 탭의 "마지막 실행" 에 남는다.
   *
   * **이미 노출된 추천은 바뀌지 않는다.** 노출 시점의 멤버와 공통 관심사가 스냅샷으로
   * 굳어 있다(D-45). 새 값은 다음 후보부터 적용된다.
   *
   * `network_enabled` 가 꺼져 있으면 후보만 다시 계산되고 노출·알림은 나가지 않는다(D-75).
   */
  async setParameter(
    key: OpsEditableParameterKey,
    value: number,
    actorId: string,
  ): Promise<OpsParameterUpdateResult> {
    const def = OPS_EDITABLE_PARAMETERS[key];
    if (!Number.isInteger(value) || value < def.min || value > def.max) {
      throw new AppError('VALIDATION_FAILED', undefined, `${def.min}~${def.max} 사이의 정수여야 합니다.`);
    }

    // 최소가 최대를 넘으면 아무도 관심사를 저장할 수 없게 된다.
    if (key === 'P-01') {
      const max = await this.parameters.get('P-02');
      if (value > max) {
        throw new AppError(
          'VALIDATION_FAILED',
          undefined,
          `최대 선택 수(P-02 = ${max})보다 클 수 없습니다.`,
        );
      }
    }
    // 그룹 최대 인원보다 큰 교집합을 요구하는 것은 막지 않는다 — 관심사 개수와 사람 수는 다른 축이다.

    const oldValue = await this.parameters.setParameter(key, value, {
      updatedBy: actorId,
      reason: '/ops',
    });

    const run = (await this.jobRunner.runNow('network.recompute')) as
      | { candidates?: number; exposed?: number }
      | null;

    return {
      key,
      oldValue,
      newValue: value,
      candidates: run?.candidates ?? 0,
      exposed: run?.exposed ?? 0,
    };
  }

  /** 가입에 초대 링크가 필요한지(D-84). 플래그 하나. 캐시는 setFlag 가 비운다. */
  async setInviteRequired(required: boolean): Promise<void> {
    await this.parameters.setFlag('invite_required', required);
  }

  /** 운영자 목록(D-79). 표시명과 이메일뿐이다. 실명은 없다. */
  async operators(actorId: string): Promise<OpsOperator[]> {
    const users = await this.prisma.user.findMany({
      where: { isOperator: true, status: { not: 'WITHDRAWN' } },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((user) => ({
      id: user.id,
      displayName: this.presenter.displayName(user),
      email: user.email,
      self: user.id === actorId,
    }));
  }

  /**
   * 이메일(Google 계정)로 지정한다. 목록에서 고르게 하지 않는 이유는 구성원 전체의 이메일을 나열하지 않기 위해서다(docs/12 §1).
   * 가입·온보딩을 마친 사람만 된다 — 운영자 엔드포인트가 OnboardedGuard 뒤에 있어 그 전에는 어차피 못 쓴다.
   */
  async addOperator(email: string, actorId: string): Promise<OpsOperator> {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
    });
    if (!user) {
      throw new AppError('NOT_FOUND', undefined, '그 이메일로 가입한 사용자가 없습니다. 먼저 가입과 온보딩을 마쳐야 합니다.');
    }
    if (user.status !== 'ACTIVE') {
      throw new AppError('VALIDATION_FAILED', undefined, '온보딩을 마치지 않은 사용자입니다. 온보딩을 끝낸 뒤 추가합니다.');
    }
    const updated = user.isOperator
      ? user
      : await this.prisma.user.update({ where: { id: user.id }, data: { isOperator: true } });
    return {
      id: updated.id,
      displayName: this.presenter.displayName(updated),
      email: updated.email,
      self: updated.id === actorId,
    };
  }

  /** 자기 자신은 해제할 수 없다 — 마지막 운영자가 사라지는 길을 막는다. */
  async removeOperator(id: string, actorId: string): Promise<void> {
    if (id === actorId) {
      throw new AppError('VALIDATION_FAILED', undefined, '자기 자신은 해제할 수 없습니다. 다른 운영자가 해제해야 합니다.');
    }
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target || !target.isOperator) throw new AppError('NOT_FOUND');
    await this.prisma.user.update({ where: { id }, data: { isOperator: false } });
  }

  // ───────────────────────────────────────────── 공지

  /**
   * 전체 공지 (운영자 → 온보딩을 마친 전원).
   *
   * 알림함에는 **모두에게** 남기고, 메신저 DM 은 즉시 알림을 켜 둔 사람에게만 간다
   * (`NotificationsService.notify` 가 설정을 본다). 끈 사람도 앱에 들어오면 읽을 수 있다.
   *
   * 발송은 대기열이 동시 5건으로 흘려보낸다 — 1,000명에게 한꺼번에 웹훅을 때리지 않는다(design/23 §1).
   * 같은 글을 두 번 눌러도 `dedupeKey` 가 같으면 한 번만 간다.
   */
  async announce(input: {
    title?: string;
    body: string;
    targetPath?: string;
  }): Promise<OpsAnnounceResult> {
    const title = input.title?.trim() || null;
    const body = input.body.trim();
    const targetPath = input.targetPath?.trim() || '/';

    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', onboardedAt: { not: null } },
      select: { id: true },
    });

    // 한 번 보낼 때마다 새 키. 같은 글을 다시 보내고 싶을 수도 있어 내용으로 묶지 않는다.
    const key = `announce:${Date.now()}`;
    const settings = await this.prisma.notificationSetting.findMany({
      where: { channel: 'MATTERMOST', category: 'IMMEDIATE', enabled: false },
      select: { userId: true },
    });
    const optedOut = new Set(settings.map((row) => row.userId));

    for (const user of users) {
      await this.notifier.notify({
        userId: user.id,
        type: 'ANNOUNCEMENT',
        payload: { title: title ?? undefined, body },
        targetPath,
        dedupeKey: key,
      });
    }

    const appOnly = users.filter((user) => optedOut.has(user.id)).length;
    return {
      id: key,
      recipients: users.length,
      messenger: users.length - appOnly,
      appOnly,
    };
  }

  /** 보낸 공지 목록. 알림 행을 dedupeKey 로 묶어 센다. */
  async announcements(limit = 10): Promise<OpsAnnouncement[]> {
    const rows = await this.prisma.$queryRaw<
      {
        key: string;
        title: string | null;
        body: string;
        sent_at: Date;
        recipients: bigint;
        messenger: bigint;
      }[]
    >`
      SELECT
        n.payload ->> 'dedupeKey'                       AS key,
        min(n.payload ->> 'title')                      AS title,
        min(n.payload ->> 'body')                       AS body,
        min(n.created_at)                               AS sent_at,
        count(*)::bigint                                AS recipients,
        count(d.id) FILTER (WHERE d.status = 'SENT')::bigint AS messenger
      FROM notification n
      LEFT JOIN notification_delivery d
        ON d.notification_id = n.id AND d.channel = 'MATTERMOST'
      WHERE n.type = 'ANNOUNCEMENT'
      GROUP BY n.payload ->> 'dedupeKey'
      ORDER BY min(n.created_at) DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      id: row.key,
      title: row.title,
      body: row.body ?? '',
      sentAt: row.sent_at.toISOString(),
      recipients: Number(row.recipients),
      messenger: Number(row.messenger),
    }));
  }

  // ───────────────────────────────────────────── 서버

  private async db(): Promise<OpsMetrics['server']['db']> {
    const [size, connections, tables, events] = await Promise.all([
      this.prisma.$queryRaw<{ bytes: unknown }[]>`SELECT pg_database_size(current_database()) AS bytes`,
      this.prisma.$queryRaw<{ n: unknown }[]>`
        SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database()`,
      this.prisma.$queryRaw<{ name: string; bytes: unknown }[]>`
        SELECT relname AS name, pg_total_relation_size(relid) AS bytes
        FROM pg_stat_user_tables WHERE relname <> '_prisma_migrations'
        ORDER BY pg_total_relation_size(relid) DESC LIMIT 12`,
      this.prisma.analyticsEvent.count(),
    ]);
    // pg_stat 의 추정 행 수는 ANALYZE 전에 0 이라 정확히 센다. 이 규모(최대 수십만 행)에서는 싸다(design/23 §2).
    const counted = await Promise.all(
      tables.map(async (t) => {
        const name = t.name.replace(/"/g, '""');
        const rows = await this.prisma.$queryRawUnsafe<{ n: unknown }[]>(
          `SELECT count(*) AS n FROM "${name}"`,
        );
        return { name: t.name, rows: num(rows[0]?.n), sizeMb: mb(num(t.bytes)) };
      }),
    );
    return {
      sizeMb: mb(num(size[0]?.bytes)),
      connections: num(connections[0]?.n),
      tables: counted,
      events,
    };
  }

  private async deliveries(ctx: Ctx): Promise<OpsMetrics['server']['deliveries']> {
    const dayAgo = new Date(ctx.now.getTime() - DAY_MS);
    const stuckBefore = new Date(ctx.now.getTime() - STUCK_QUEUED_MINUTES * 60_000);
    const [last24h, stuck, failures, byDayRows] = await Promise.all([
      this.prisma.notificationDelivery.groupBy({
        by: ['status'],
        where: { channel: 'MATTERMOST', notification: { createdAt: { gte: dayAgo } } },
        _count: { _all: true },
      }),
      this.prisma.notificationDelivery.count({
        where: { channel: 'MATTERMOST', status: 'QUEUED', notification: { createdAt: { lt: stuckBefore } } },
      }),
      this.prisma.notificationDelivery.findMany({
        where: { channel: 'MATTERMOST', status: 'FAILED' },
        orderBy: { notification: { createdAt: 'desc' } },
        take: 10,
        select: { error: true, notification: { select: { type: true, createdAt: true } } },
      }),
      this.prisma.$queryRaw<{ day: string; sent: unknown; failed: unknown }[]>`
        SELECT to_char(n.created_at + interval '9 hours', 'YYYY-MM-DD') AS day,
               count(*) FILTER (WHERE d.status = 'SENT') AS sent,
               count(*) FILTER (WHERE d.status = 'FAILED') AS failed
        FROM notification_delivery d JOIN notification n ON n.id = d.notification_id
        WHERE d.channel = 'MATTERMOST' AND n.created_at >= ${ctx.since}
        GROUP BY 1`,
    ]);
    const of = (status: 'QUEUED' | 'SENT' | 'FAILED' | 'SKIPPED') =>
      last24h.find((r) => r.status === status)?._count._all ?? 0;
    const byDayMap = new Map(byDayRows.map((r) => [r.day, { sent: num(r.sent), failed: num(r.failed) }]));
    return {
      last24h: { queued: of('QUEUED'), sent: of('SENT'), failed: of('FAILED'), skipped: of('SKIPPED') },
      stuckQueued: stuck,
      recentFailures: failures.map((f) => ({
        at: f.notification.createdAt.toISOString(),
        type: f.notification.type,
        error: f.error,
      })),
      byDay: ctx.dayKeys.map((day) => ({ day, ...(byDayMap.get(day) ?? { sent: 0, failed: 0 }) })),
    };
  }

  private async jobs(now: Date): Promise<OpsJob[]> {
    const runs = await this.prisma.jobRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 400,
      select: { jobName: true, status: true, startedAt: true, finishedAt: true, detail: true },
    });
    return JOB_SCHEDULES.map(({ name, schedule, staleAfterHours }) => {
      const mine = runs.filter((r) => r.jobName === name);
      const last = mine[0];
      const lastDone = mine.find((r) => r.status === 'done');
      const lastFailed = mine.find((r) => r.status === 'failed');
      const hoursSinceSuccess = lastDone?.finishedAt
        ? Math.round(((now.getTime() - lastDone.finishedAt.getTime()) / HOUR_MS) * 10) / 10
        : null;
      const detail = lastFailed?.detail as { error?: string } | null | undefined;
      return {
        name,
        schedule,
        staleAfterHours,
        lastStatus: (last?.status as OpsJob['lastStatus']) ?? null,
        lastStartedAt: last?.startedAt.toISOString() ?? null,
        lastFinishedAt: last?.finishedAt?.toISOString() ?? null,
        lastDurationMs:
          last?.finishedAt ? last.finishedAt.getTime() - last.startedAt.getTime() : null,
        lastError: detail?.error ?? null,
        hoursSinceSuccess,
        // 프로세스가 갓 떴으면 아직 돌 기회가 없었던 것이다. 기동 뒤 주기가 지나야 늦은 것으로 본다.
        stale:
          (hoursSinceSuccess === null || hoursSinceSuccess > staleAfterHours) &&
          now.getTime() - PROCESS_STARTED_AT.getTime() > staleAfterHours * HOUR_MS,
      };
    });
  }

  /** compose 가 `deploy/backups` 를 `/backups` 로 읽기 전용 마운트한다. 없으면 available=false. */
  private async backups(): Promise<OpsMetrics['server']['backups']> {
    const dir = this.config.get<string>('BACKUPS_DIR') ?? '/backups';
    try {
      const names = (await fs.readdir(dir)).filter((n) => /^ssafynet-.*\.sql\.gz$/.test(n)).sort();
      const stat = await fs.statfs(dir);
      const lastName = names[names.length - 1];
      const last = lastName ? await fs.stat(path.join(dir, lastName)) : null;
      return {
        available: true,
        last: lastName && last ? { file: lastName, sizeMb: mb(last.size), at: last.mtime.toISOString() } : null,
        count: names.length,
        diskFreeMb: mb(Number(stat.bavail) * Number(stat.bsize)),
        diskTotalMb: mb(Number(stat.blocks) * Number(stat.bsize)),
      };
    } catch {
      return { available: false, last: null, count: 0, diskFreeMb: null, diskTotalMb: null };
    }
  }

  private async abuse(ctx: Ctx): Promise<OpsMetrics['server']['abuse']> {
    const [minSent, threshold] = await Promise.all([
      this.parameters.get('P-20'),
      this.parameters.get('P-21'),
    ]);
    const [suspended, today, sentAll, acceptedAll] = await Promise.all([
      this.prisma.user.count({ where: { requestSuspended: true } }),
      this.prisma.connectionRequest.groupBy({
        by: ['requesterId'],
        where: { createdAt: { gte: ctx.todayStart } },
        _count: { _all: true },
      }),
      this.prisma.connectionRequest.groupBy({
        by: ['requesterId'],
        where: { status: { not: 'CANCELLED' } },
        _count: { _all: true },
      }),
      this.prisma.connectionRequest.groupBy({
        by: ['requesterId'],
        where: { status: 'ACCEPTED' },
        _count: { _all: true },
      }),
    ]);
    const accepted = new Map(acceptedAll.map((r) => [r.requesterId, r._count._all]));
    // 자동 감속은 없앴지만(D-82) 신호로는 본다: 보낸 요청이 P-20 이상인데 수락률이 P-21% 미만.
    const lowAcceptRate = sentAll.filter((r) => {
      const sent = r._count._all;
      return sent >= minSent && ((accepted.get(r.requesterId) ?? 0) / sent) * 100 < threshold;
    }).length;
    return {
      suspended,
      // 횟수 상한이 없으니(D-82) 오늘 한 사람이 가장 많이 보낸 건수로 남용을 본다.
      maxSentToday: today.reduce((max, r) => Math.max(max, r._count._all), 0),
      lowAcceptRate,
    };
  }
}

interface Ctx {
  now: Date;
  todayStart: Date;
  since: Date;
  days: number;
  dayKeys: string[];
}

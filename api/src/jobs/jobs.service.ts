import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../infra/prisma/prisma.service';
import { RelationService } from '../modules/connections/relation.service';
import { FollowUpService } from '../modules/connections/follow-up.service';
import { CandidateService } from '../modules/networks/candidate.service';
import { ExposureService } from '../modules/networks/exposure.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { ParametersService } from '../modules/parameters/parameters.service';
import { UserPresenter } from '../modules/users/user.presenter';

const DAY_MS = 86_400_000;
const KST = 'Asia/Seoul';

/**
 * 배치 작업 (design/20 §7).
 *
 * 프로세스가 하나라 분산 락이 필요 없다. 대신 모든 잡이 **멱등**이어야 한다 —
 * 재실행해도 알림이 두 번 가지 않도록 상태 전이와 발송 기록을 함께 확인한다.
 *
 * 시간 파라미터는 전부 하루 단위다(D-33). 이 잡들이 없으면 요청 만료(3일)도
 * 후속 확인(2일)도 영원히 일어나지 않는다 — 사슬이 여기서 끊긴다.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parameters: ParametersService,
    private readonly notifications: NotificationsService,
    private readonly followUps: FollowUpService,
    private readonly candidates: CandidateService,
    private readonly exposure: ExposureService,
    private readonly relations: RelationService,
    private readonly presenter: UserPresenter,
  ) {}

  /** 잡 하나를 실행하고 결과를 남긴다. runKey가 같으면 다시 돌지 않는다. */
  private async run<T>(
    jobName: string,
    runKey: string,
    body: () => Promise<T>,
  ): Promise<T | null> {
    const existing = await this.prisma.jobRun.findUnique({
      where: { jobName_runKey: { jobName, runKey } },
    });
    if (existing?.status === 'done') return null;

    const started = await this.prisma.jobRun.upsert({
      where: { jobName_runKey: { jobName, runKey } },
      update: { status: 'running', startedAt: new Date() },
      create: { jobName, runKey, status: 'running' },
    });

    try {
      const result = await body();
      await this.prisma.jobRun.update({
        where: { id: started.id },
        data: {
          status: 'done',
          finishedAt: new Date(),
          detail: result as never,
        },
      });
      return result;
    } catch (error) {
      await this.prisma.jobRun.update({
        where: { id: started.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          detail: { error: String(error) },
        },
      });
      this.logger.error(`${jobName} 실패: ${String(error)}`);
      return null;
    }
  }

  private slot(minutes: number): string {
    const now = Date.now();
    return new Date(now - (now % (minutes * 60_000))).toISOString();
  }

  // ─────────────────────────────────────────────────────────
  // 연결 요청
  // ─────────────────────────────────────────────────────────

  /** 만료된 요청을 정리한다. 받은 쪽 목록에서 사라지고 보낸 쪽엔 "응답 없음"(P-08). */
  @Cron(CronExpression.EVERY_10_MINUTES, { timeZone: KST })
  async expireRequests() {
    return this.run('request.expire', this.slot(10), async () => {
      const result = await this.prisma.connectionRequest.updateMany({
        where: { status: 'PENDING', expiresAt: { lt: new Date() } },
        data: { status: 'EXPIRED', expiredAt: new Date() },
      });
      if (result.count > 0) this.logger.log(`요청 ${result.count}건 만료`);
      return { expired: result.count };
    });
  }

  /** 만료 하루 전에 한 번 알린다(docs/09 §4). */
  @Cron(CronExpression.EVERY_HOUR, { timeZone: KST })
  async remindExpiringRequests() {
    return this.run('request.expiry-remind', this.slot(60), async () => {
      const soon = new Date(Date.now() + DAY_MS);
      const requests = await this.prisma.connectionRequest.findMany({
        where: {
          status: 'PENDING',
          expiresAt: { gt: new Date(), lte: soon },
        },
        include: { requester: true },
      });

      for (const request of requests) {
        await this.notifications.notify({
          userId: request.targetId,
          type: 'CONNECTION_REQUEST_EXPIRING',
          // dedupeKey가 있으니 배치가 여러 번 돌아도 한 번만 간다.
          dedupeKey: `expiring:${request.id}`,
          payload: {
            displayName: this.presenter.displayName(request.requester),
            commonInterests: await this.interestNames(request.commonInterestIds),
            messagePreview: request.message.split('\n')[0].slice(0, 60),
          },
          targetPath: `/connections?request=${request.id}`,
        });
      }
      return { notified: requests.length };
    });
  }

  /**
   * 시작자가 [P-11]일 안에 표시하지 않으면 양쪽에 재안내한다(docs/09 §5).
   * H5의 가장 약한 고리를 보강하는 장치다.
   */
  @Cron(CronExpression.EVERY_HOUR, { timeZone: KST })
  async remindInitiators() {
    return this.run('connection.initiator-remind', this.slot(60), async () => {
      const days = await this.parameters.get('P-11');
      const cutoff = new Date(Date.now() - days * DAY_MS);

      const connections = await this.prisma.connection.findMany({
        where: {
          establishedAt: { lte: cutoff },
          initiatorMarkedAt: null,
          reminderSentAt: null,
        },
        include: { userA: true, userB: true },
      });

      for (const connection of connections) {
        const initiator =
          connection.initiatorId === connection.userAId
            ? connection.userA
            : connection.userB;
        const counterpart =
          connection.initiatorId === connection.userAId
            ? connection.userB
            : connection.userA;

        await this.notifications.notify({
          userId: initiator.id,
          type: 'CONNECTION_INITIATOR_REMINDER',
          dedupeKey: `initiator:${connection.id}`,
          payload: {
            realName: this.presenter.fullRealName(counterpart) ?? '',
            mattermostUsername: counterpart.mattermostUsername ?? undefined,
          },
          targetPath: `/connections?connection=${connection.id}`,
        });

        await this.notifications.notify({
          userId: counterpart.id,
          type: 'CONNECTION_COUNTERPART_REMINDER',
          dedupeKey: `counterpart:${connection.id}`,
          payload: {
            realName: this.presenter.fullRealName(initiator) ?? '',
            mattermostUsername: initiator.mattermostUsername ?? undefined,
          },
          targetPath: `/connections?connection=${connection.id}`,
        });

        await this.prisma.connection.update({
          where: { id: connection.id },
          data: { reminderSentAt: new Date() },
        });
      }
      return { reminded: connections.length };
    });
  }

  /**
   * 성립 [P-18]일 뒤에 후속 확인을 만든다(M14).
   * 대화는 서비스 밖에서 일어나므로 이 응답이 H5를 재는 유일한 신호다.
   */
  @Cron(CronExpression.EVERY_HOUR, { timeZone: KST })
  async askFollowUps() {
    return this.run('connection.follow-up', this.slot(60), async () => {
      const days = await this.parameters.get('P-18');
      const cutoff = new Date(Date.now() - days * DAY_MS);

      const connections = await this.prisma.connection.findMany({
        where: { establishedAt: { lte: cutoff } },
        include: { userA: true, userB: true },
      });

      let created = 0;
      for (const connection of connections) {
        const existing = await this.prisma.followUpCheck.count({
          where: { subjectType: 'CONNECTION', subjectId: connection.id },
        });
        if (existing > 0) continue;

        await this.followUps.createForConnection(connection.id, [
          connection.userAId,
          connection.userBId,
        ]);

        for (const [me, other] of [
          [connection.userA, connection.userB],
          [connection.userB, connection.userA],
        ]) {
          await this.notifications.notify({
            userId: me.id,
            type: 'FOLLOW_UP_ASK',
            dedupeKey: `followup:${connection.id}`,
            payload: {
              counterpartName: this.presenter.fullRealName(other) ?? '',
            },
            targetPath: '/connections',
          });
        }
        created += 1;
      }
      return { created };
    });
  }

  // ─────────────────────────────────────────────────────────
  // Network
  // ─────────────────────────────────────────────────────────

  /** 후보 풀 전체 재계산 + 빈 슬롯 노출 (docs/10 §2a). */
  @Cron('0 0 9,18 * * *', { timeZone: KST })
  async recomputeNetworks() {
    return this.run('network.recompute', this.slot(60), async () => {
      const candidates = await this.candidates.recomputeAll();
      const exposed = await this.exposure.expose();
      return { candidates: candidates.length, exposed: exposed.created };
    });
  }

  /** 만료된 추천 정리. 인원 미달이면 참여자에게 알린다(docs/10 §6). */
  @Cron(CronExpression.EVERY_HOUR, { timeZone: KST })
  async expireNetworks() {
    return this.run('network.expire', this.slot(60), async () => {
      const expired = await this.prisma.networkRecommendation.findMany({
        where: { status: 'OPEN', expiresAt: { lt: new Date() } },
        include: { members: true },
      });

      for (const recommendation of expired) {
        await this.prisma.networkRecommendation.update({
          where: { id: recommendation.id },
          data: { status: 'EXPIRED' },
        });

        // 참여했던 사람에게만 알린다. 결정하지 않은 사람에게는 알릴 것이 없다.
        for (const member of recommendation.members.filter(
          (m) => m.decision === 'JOINED',
        )) {
          await this.notifications.notify({
            userId: member.userId,
            type: 'NETWORK_FAILED',
            dedupeKey: `network-failed:${recommendation.id}`,
            payload: {},
            targetPath: '/networks?tab=recommended',
          });
        }
      }
      return { expired: expired.length };
    });
  }

  /** 만료 하루 전 미결정 멤버에게 한 번(docs/10 §5). */
  @Cron(CronExpression.EVERY_HOUR, { timeZone: KST })
  async remindExpiringNetworks() {
    return this.run('network.expiry-remind', this.slot(60), async () => {
      const soon = new Date(Date.now() + DAY_MS);
      const rows = await this.prisma.networkRecommendation.findMany({
        where: { status: 'OPEN', expiresAt: { gt: new Date(), lte: soon } },
        include: { members: true },
      });

      let notified = 0;
      for (const row of rows) {
        for (const member of row.members.filter(
          (m) => m.decision === 'PENDING',
        )) {
          await this.notifications.notify({
            userId: member.userId,
            type: 'NETWORK_EXPIRING',
            dedupeKey: `network-expiring:${row.id}`,
            payload: {
              reason: `이 ${row.size}명은 관심사 ${row.commonInterestIds.length}개를 모두 공유합니다`,
            },
            targetPath: `/networks?open=${row.id}`,
          });
          notified += 1;
        }
      }
      return { notified };
    });
  }

  /** 성립 후 [P-11]일 안에 초대 표시가 없으면 나머지에게 안내(docs/10 §6). */
  @Cron(CronExpression.EVERY_HOUR, { timeZone: KST })
  async remindNetworkInitiators() {
    return this.run('network.initiator-remind', this.slot(60), async () => {
      const days = await this.parameters.get('P-11');
      const cutoff = new Date(Date.now() - days * DAY_MS);

      const rows = await this.prisma.networkRecommendation.findMany({
        where: {
          status: 'ACTIVATED',
          activatedAt: { lte: cutoff },
          initiatorMarkedAt: null,
          reminderSentAt: null,
        },
        include: { members: true },
      });

      for (const row of rows) {
        for (const member of row.members.filter(
          (m) => m.decision === 'JOINED',
        )) {
          await this.notifications.notify({
            userId: member.userId,
            type:
              member.userId === row.initiatorId
                ? 'NETWORK_INITIATOR_REMINDER'
                : 'NETWORK_MEMBER_REMINDER',
            dedupeKey: `network-remind:${row.id}`,
            payload: {},
            targetPath: `/networks?open=${row.id}`,
          });
        }
        await this.prisma.networkRecommendation.update({
          where: { id: row.id },
          data: { reminderSentAt: new Date() },
        });
      }
      return { reminded: rows.length };
    });
  }

  /**
   * 데이터 게이트 판정 (docs/10 §4).
   * 판정만 하고 켜지는 않는다. 켜는 것은 운영자의 결정이다.
   */
  @Cron('0 5 9 * * *', { timeZone: KST })
  async evaluateGate() {
    return this.run('gate.evaluate', this.slot(60), async () => {
      const gate = await this.candidates.evaluateGate();
      this.logger.log(
        `게이트: 1인당 ${gate.perUser} (${gate.passes ? '통과' : '미통과'})`,
      );
      return gate;
    });
  }

  // ─────────────────────────────────────────────────────────
  // 묶음 알림 (S3)
  // ─────────────────────────────────────────────────────────

  /**
   * 묶음 알림 (P-12: 첫 2주 일 1회, 이후 주 1회).
   *
   * 요청이 없는 날에도 돌아올 이유를 만든다(H9). 즉시 알림과 달리
   * "나에게 온 것"이 아니라 "새로 생긴 것"을 모아 보낸다.
   *
   * 보낼 것이 없으면 보내지 않는다. 빈 알림은 알림을 끄게 만든다.
   */
  @Cron('0 0 9 * * *', { timeZone: KST })
  async sendDigest() {
    return this.run('digest.send', this.slot(60), async () => {
      const [minCommon, activeUsers] = await Promise.all([
        this.parameters.get('P-03'),
        this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      ]);

      const since = new Date(Date.now() - DAY_MS);
      const users = await this.prisma.user.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
      });

      let sent = 0;
      for (const user of users) {
        const myInterests = await this.prisma.userInterest.findMany({
          // 속성(층)은 공통 관심사로 세지 않는다(D-72).
          where: { userId: user.id, interest: { category: { kind: 'INTEREST' } } },
          select: { interestId: true },
        });
        const ids = myInterests.map((row) => row.interestId);
        if (ids.length === 0) continue;

        const [newPeople, newPosts, openNetworks] = await Promise.all([
          // 어제 이후 온보딩을 마친 사람 중 나와 공통이 [P-03] 이상인 수
          this.prisma.$queryRaw<{ n: bigint }[]>`
            SELECT count(*)::bigint AS n FROM (
              SELECT ui.user_id
              FROM user_interest ui
              JOIN "user" u ON u.id = ui.user_id
              WHERE ui.interest_id = ANY(${ids})
                AND ui.user_id <> ${user.id}
                AND u.status = 'ACTIVE'
                AND u.onboarded_at >= ${since}
              GROUP BY ui.user_id
              HAVING count(*) >= ${minCommon}
            ) x`,
          this.prisma.interestPost.count({
            where: {
              interestId: { in: ids },
              createdAt: { gte: since },
              deletedAt: null,
              NOT: { authorId: user.id },
            },
          }),
          this.prisma.networkMember.count({
            where: {
              userId: user.id,
              decision: 'PENDING',
              recommendation: { status: 'OPEN', expiresAt: { gt: new Date() } },
            },
          }),
        ]);

        const people = Number(newPeople[0]?.n ?? 0);
        const lines: string[] = [];
        if (people > 0) lines.push(`나와 관심사가 겹치는 사람 ${people}명이 새로 왔습니다`);
        if (newPosts > 0) lines.push(`내 관심사에 새 글 ${newPosts}개`);
        if (openNetworks > 0) lines.push(`아직 결정하지 않은 네트워크 추천 ${openNetworks}개`);

        // 보낼 것이 없으면 보내지 않는다.
        if (lines.length === 0) continue;

        await this.notifications.notify({
          userId: user.id,
          type: 'DIGEST',
          dedupeKey: `digest:${new Date().toISOString().slice(0, 10)}`,
          payload: { reason: lines.join(' · ') },
          targetPath: '/',
        });
        sent += 1;
      }

      this.logger.log(`묶음 알림 ${sent}명 (활성 ${activeUsers}명)`);
      return { sent };
    });
  }

  /**
   * 주말에 미뤄 둔 DM 을 월요일 아침에 한 통으로 보낸다(D-95).
   *
   * 묶음 알림(09:00)과 같은 시각이다. 둘 다 받는 사람은 DM 두 통을 보는데, 하나는
   * "주말에 온 것", 다른 하나는 "어제 이후 새 소식" 으로 뜻이 다르다.
   */
  @Cron('0 0 9 * * 1', { timeZone: KST })
  async flushWeekendNotifications() {
    return this.run('weekend.summary', this.slot(60), async () => {
      const result = await this.notifications.flushWeekendBacklog();
      if (result.held > 0) {
        this.logger.log(`주말 요약 ${result.users}명 (미뤄 둔 알림 ${result.held}건)`);
      }
      return result;
    });
  }

  // ─────────────────────────────────────────────────────────

  private async interestNames(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.interest.findMany({
      where: { id: { in: ids } },
      orderBy: { sortOrder: 'asc' },
      select: { name: true },
    });
    return rows.map((row) => row.name);
  }

  /** 운영자가 잡을 즉시 돌린다. 3일을 기다리지 않고 확인하기 위한 것이다. */
  async runNow(name: string): Promise<unknown> {
    // 강제 실행이므로 runKey를 매번 새로 만든다.
    const jobs: Record<string, () => Promise<unknown>> = {
      'request.expire': () => this.expireRequests(),
      'request.expiry-remind': () => this.remindExpiringRequests(),
      'connection.initiator-remind': () => this.remindInitiators(),
      'connection.follow-up': () => this.askFollowUps(),
      'network.recompute': () => this.recomputeNetworks(),
      'network.expire': () => this.expireNetworks(),
      'network.expiry-remind': () => this.remindExpiringNetworks(),
      'network.initiator-remind': () => this.remindNetworkInitiators(),
      'gate.evaluate': () => this.evaluateGate(),
      'digest.send': () => this.sendDigest(),
      'weekend.summary': () => this.flushWeekendNotifications(),
    };

    const job = jobs[name];
    if (!job) return { error: `알 수 없는 잡: ${name}`, available: Object.keys(jobs) };

    await this.prisma.jobRun.deleteMany({ where: { jobName: name } });
    return job();
  }
}

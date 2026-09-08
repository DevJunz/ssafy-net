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
    };

    const job = jobs[name];
    if (!job) return { error: `알 수 없는 잡: ${name}`, available: Object.keys(jobs) };

    await this.prisma.jobRun.deleteMany({ where: { jobName: name } });
    return job();
  }
}

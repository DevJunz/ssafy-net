import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NotificationType } from '@prisma/client';
import { SERVICE_NAME } from '@ssafy-net/shared';
import { MattermostService } from '../../infra/mattermost/mattermost.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ParametersService } from '../parameters/parameters.service';
import {
  NOTIFICATION_RULES,
  type NotificationPayload,
} from './notification.catalog';
import { WEEKEND_HELD, WEEKEND_SUMMARIZED, isWeekendKst } from './weekend';

/**
 * 알림 생성과 발송 (design/20 §8).
 *
 * 앱 내 알림함은 **항상** 생긴다. 외부 채널이 실패해도 로그인하면 보인다 —
 * 채널이 Mattermost 하나뿐이므로(D-67) 이것이 유일한 대비책이다.
 *
 * 발송은 도메인 트랜잭션 밖에서, 응답을 붙잡지 않고 한다. 알림 실패가
 * 요청 수락 같은 도메인 처리를 막아서는 안 된다.
 */
/**
 * 웹훅을 한꺼번에 때리지 않는다.
 *
 * 묶음 알림(매일 9시)과 운영자 공지는 한 번에 1,000명에게 나갈 수 있다. 상한이 없으면
 * fetch 1,000건이 동시에 뜨고 Mattermost 가 429/타임아웃을 뱉는다(design/23 §1).
 * 5건씩 흘려보내면 1,000명이 몇 분에 걸쳐 나간다 — 알림은 몇 분 늦어도 된다.
 */
const MAX_CONCURRENT_DELIVERIES = 5;

/** 재시도 간격. 400(없는 아이디)처럼 다시 해도 소용없는 것은 재시도하지 않는다. */
const RETRY_DELAYS_MS = [1_000, 5_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  /** 발송 대기열. 프로세스 안에만 있다 — 재시작하면 남은 것은 알림함에만 남는다. */
  private readonly queue: Array<() => Promise<void>> = [];
  private running = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mattermost: MattermostService,
    private readonly config: ConfigService,
    private readonly parameters: ParametersService,
  ) {}

  /**
   * 알림 하나를 만들고 발송을 예약한다.
   *
   * `dedupeKey`가 주어지면 같은 키의 알림이 이미 있을 때 만들지 않는다.
   * 배치가 두 번 돌아도 두 번 보내지 않기 위한 것이다(design/20 §7).
   */
  async notify(input: {
    userId: string;
    type: NotificationType;
    payload: NotificationPayload;
    targetPath: string;
    dedupeKey?: string;
  }): Promise<void> {
    const rule = NOTIFICATION_RULES[input.type];

    if (input.dedupeKey) {
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId: input.userId,
          type: input.type,
          payload: { path: ['dedupeKey'], equals: input.dedupeKey },
        },
        select: { id: true },
      });
      if (existing) return;
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        payload: {
          ...input.payload,
          ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
        },
        targetPath: input.targetPath,
        actionRequired: rule.actionRequired,
      },
    });

    // 앱 내 알림함은 끌 수 없다. 항상 도착한 것으로 본다.
    await this.prisma.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        channel: 'IN_APP',
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    const wantsMattermost = await this.channelEnabled(
      input.userId,
      rule.category,
    );
    if (!wantsMattermost) return;

    // 주말에는 DM 을 보내지 않는다(D-95). 알림함에는 이미 남았으니 잃는 것은 없고,
    // 미룬 것은 표시만 해 두었다가 월요일 아침 한 통으로 요약한다.
    // 운영자 공지만 예외다 — 토요일에 공지를 보냈다면 그건 지금 알리려는 뜻이다.
    if (input.type !== 'ANNOUNCEMENT' && (await this.weekendQuiet())) {
      await this.prisma.notificationDelivery.create({
        data: {
          notificationId: notification.id,
          channel: 'MATTERMOST',
          status: 'SKIPPED',
          error: WEEKEND_HELD,
        },
      });
      return;
    }

    const delivery = await this.prisma.notificationDelivery.create({
      data: { notificationId: notification.id, channel: 'MATTERMOST' },
    });

    // 응답을 붙잡지 않는다. 실패해도 알림함에는 남아 있다.
    this.enqueue(() =>
      this.deliver(delivery.id, input.userId, input.type, input.payload),
    );
  }

  /** 지금 밀려 있는 발송 수(대기 + 진행). 운영 화면이 본다. */
  get pendingDeliveries(): number {
    return this.queue.length + this.running;
  }

  private enqueue(task: () => Promise<void>): void {
    this.queue.push(task);
    this.pump();
  }

  private pump(): void {
    while (this.running < MAX_CONCURRENT_DELIVERIES && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) return;
      this.running += 1;
      void task()
        .catch((error) => this.logger.error(`발송 중 예외: ${String(error)}`))
        .finally(() => {
          this.running -= 1;
          this.pump();
        });
    }
  }

  private async channelEnabled(
    userId: string,
    category: 'IMMEDIATE' | 'DIGEST',
  ): Promise<boolean> {
    const setting = await this.prisma.notificationSetting.findUnique({
      where: {
        userId_channel_category: {
          userId,
          channel: 'MATTERMOST',
          category,
        },
      },
    });
    // 설정이 없으면 켜진 것으로 본다. 온보딩에서 만들지만 없을 수도 있다.
    return setting?.enabled ?? true;
  }

  /** 지금이 주말이고 스위치도 켜져 있는가(D-95). 플래그는 30초 캐시된다. */
  private async weekendQuiet(): Promise<boolean> {
    if (!isWeekendKst()) return false;
    return this.parameters.flag('weekend_quiet');
  }

  /**
   * 주말에 미뤄 둔 DM 을 사람마다 한 통으로 요약해 보낸다(D-95). 월요일 09:00 배치가 부른다.
   *
   * 세는 것은 **아직 읽지 않은 것**뿐이다. 주말에 앱을 열어 본 사람은 이미 다 본
   * 것이고(알림함을 열면 전부 읽음이 된다, D-81), 그 사람에게 월요일 아침에
   * "알림 3건이 왔습니다" 라고 보내면 소음이다. 읽은 것도 표시는 바꿔 둔다.
   *
   * 미뤄 둔 것은 이미 각자의 알림 설정을 지나 온 것이므로 여기서 다시 거르지 않는다.
   */
  async flushWeekendBacklog(): Promise<{ users: number; held: number }> {
    const held = await this.prisma.notificationDelivery.findMany({
      where: { channel: 'MATTERMOST', status: 'SKIPPED', error: WEEKEND_HELD },
      select: {
        id: true,
        notification: {
          select: { userId: true, readAt: true, actionRequired: true, resolvedAt: true },
        },
      },
    });
    if (held.length === 0) return { users: 0, held: 0 };

    const byUser = new Map<string, { ids: string[]; unread: number; todo: number }>();
    for (const row of held) {
      const bucket = byUser.get(row.notification.userId) ?? { ids: [], unread: 0, todo: 0 };
      bucket.ids.push(row.id);
      if (!row.notification.readAt) {
        bucket.unread += 1;
        if (row.notification.actionRequired && !row.notification.resolvedAt) bucket.todo += 1;
      }
      byUser.set(row.notification.userId, bucket);
    }

    let sent = 0;
    for (const [userId, bucket] of byUser) {
      if (bucket.unread > 0) {
        const lines = [`주말 동안 알림 ${bucket.unread}건이 왔습니다.`];
        if (bucket.todo > 0) lines.push(`그중 ${bucket.todo}건은 답을 기다립니다.`);
        await this.deliverWeekendSummary(userId, lines.join(' '));
        sent += 1;
      }
      await this.prisma.notificationDelivery.updateMany({
        where: { id: { in: bucket.ids } },
        data: { error: WEEKEND_SUMMARIZED },
      });
    }

    return { users: sent, held: held.length };
  }

  /**
   * 주말 요약 한 통. 알림함에도 한 줄 남는다 — 링크(`/n/<deliveryId>`)가 발송 기록을
   * 가리키므로 알림 없이 DM 만 보낼 수는 없다.
   *
   * 여기서는 알림 설정을 보지 않는다. 미뤄 둔 것들이 이미 그 검사를 지나 왔으므로
   * 한 번 더 거르면 "즉시는 켜고 묶음은 끈" 사람이 주말 것을 영영 못 받게 된다.
   */
  private async deliverWeekendSummary(userId: string, reason: string): Promise<void> {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type: 'DIGEST',
        payload: { reason },
        targetPath: '/notifications',
        actionRequired: false,
      },
    });

    await this.prisma.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        channel: 'IN_APP',
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    const delivery = await this.prisma.notificationDelivery.create({
      data: { notificationId: notification.id, channel: 'MATTERMOST' },
    });

    this.enqueue(() =>
      this.deliver(delivery.id, userId, 'DIGEST', { reason }),
    );
  }

  private async deliver(
    deliveryId: string,
    userId: string,
    type: NotificationType,
    payload: NotificationPayload,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mattermostUsername: true },
    });

    if (!user?.mattermostUsername) {
      await this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: { status: 'SKIPPED', error: 'Mattermost 아이디 없음' },
      });
      return;
    }

    const base = this.config.get<string>('APP_BASE_URL') ?? '';
    const body = [
      // 받는 사람에게는 운영자 계정의 DM으로 보인다. 어느 서비스의 알림인지 머리말로 밝힌다.
      `**${SERVICE_NAME}**`,
      '',
      NOTIFICATION_RULES[type].render(payload),
      '',
      // 알림에 행동 버튼을 두지 않는다. 링크 하나로 행동 화면에 직행한다(D-25, FR-14.4).
      `[확인하기](${base}/n/${deliveryId})`,
    ].join('\n');

    // 재시도. 없는 아이디(400)와 설정 누락은 다시 해도 같으니 한 번으로 끝낸다.
    for (let attempt = 0; ; attempt += 1) {
      const result = await this.mattermost.sendDirectMessage(
        user.mattermostUsername,
        body,
      );

      if (result.ok) {
        await this.prisma.notificationDelivery.update({
          where: { id: deliveryId },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            attempts: { increment: 1 },
            error: null,
          },
        });
        return;
      }

      const retryable = result.error !== '400' && !result.error?.includes('없음');
      const last = attempt >= RETRY_DELAYS_MS.length;

      await this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: retryable && !last ? 'QUEUED' : 'FAILED',
          attempts: { increment: 1 },
          error: result.error ?? null,
        },
      });

      if (!retryable || last) {
        this.logger.warn(
          `알림 발송 실패 ${deliveryId}: ${result.error} (시도 ${attempt + 1}회)`,
        );
        return;
      }

      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  /**
   * 대상이 처리되면 배지에서 뺀다.
   * 배지는 처리가 필요한 것의 수다 — 0이면 할 일이 없다는 뜻이어야 한다(D-31).
   */
  async resolve(userId: string, type: NotificationType, targetPath: string) {
    await this.prisma.notification.updateMany({
      where: { userId, type, targetPath, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
  }

  async resolveByPath(userId: string, targetPath: string) {
    await this.prisma.notification.updateMany({
      where: { userId, targetPath, resolvedAt: null, actionRequired: true },
      data: { resolvedAt: new Date() },
    });
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NotificationType } from '@prisma/client';
import { SERVICE_NAME } from '@ssafy-net/shared';
import { MattermostService } from '../../infra/mattermost/mattermost.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  NOTIFICATION_RULES,
  type NotificationPayload,
} from './notification.catalog';

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

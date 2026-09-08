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
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

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
    void this.deliver(delivery.id, input.userId, input.type, input.payload);
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

    const result = await this.mattermost.sendDirectMessage(
      user.mattermostUsername,
      body,
    );

    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: result.ok ? 'SENT' : 'FAILED',
        sentAt: result.ok ? new Date() : null,
        attempts: { increment: 1 },
        error: result.error ?? null,
      },
    });

    if (!result.ok) {
      this.logger.warn(`알림 발송 실패 ${deliveryId}: ${result.error}`);
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

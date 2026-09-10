import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/current-user.decorator';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { AuthGuard, OnboardedGuard } from '../auth/auth.guard';
import { SessionService } from '../auth/session.service';
import { NOTIFICATION_RULES } from './notification.catalog';

@ApiTags('알림')
@ApiCookieAuth('sn_session')
@Controller('notifications')
@UseGuards(AuthGuard, OnboardedGuard)
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: '알림함',
    description:
      '알림 채널은 Mattermost DM + 이 알림함 둘뿐이다(D-67). 최신순.\n\n' +
      '`[{ id, type, text, targetPath, actionRequired, resolved, readAt, createdAt }]`\n\n' +
      '- `text`는 판단 근거(표시명, 공통 관심사, 메시지 첫 줄)를 넣어 서버가 완성한 문장(FR-14.3)\n' +
      '- 수락/거절 같은 행동 필드는 없다(D-25). `targetPath`로 행동 화면에 직행한다\n' +
      '- 배지는 `readAt`이 없는 것의 수다(D-81). 알림함을 열면 `POST /notifications/read-all` 로 전부 읽음이 된다',
  })
  @ApiQuery({ name: 'limit', required: false, description: '기본 50, 최대 100' })
  async list(
    @CurrentUser() user: User,
    @Query('limit') limit: string | undefined,
  ) {
    const rows = await this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'desc' }],
      take: Math.min(Number(limit ?? 50) || 50, 100),
    });

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      // 목록에도 판단 근거를 그대로 보여준다(FR-14.3).
      text: NOTIFICATION_RULES[row.type].render(
        row.payload as Record<string, never>,
      ),
      targetPath: row.targetPath,
      actionRequired: row.actionRequired,
      resolved: Boolean(row.resolvedAt),
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * 배지 = **아직 확인하지 않은 알림 수**다(D-81). 알림함을 열면 0이 된다.
   * 처리가 남은 것은 알림함 위쪽 "처리가 필요한 것"과 연결 화면이 보여 준다.
   */
  @Get('badge')
  @ApiOperation({
    summary: '배지 수',
    description:
      '`{ count }`. **아직 확인하지 않은 알림 수**다(D-81) — `readAt`이 없는 것. ' +
      '알림함을 열면 `POST /notifications/read-all` 이 전부 읽음으로 만들어 0이 된다. 처리가 남은 것은 알림함의 "처리가 필요한 것" 구역이 보여 준다.',
  })
  async badge(@CurrentUser() user: User) {
    const count = await this.prisma.notification.count({
      where: { userId: user.id, readAt: null },
    });
    return { count };
  }

  /** 알림함을 열면 부른다. 지금까지 온 것을 전부 확인한 것으로 친다(D-81). */
  @Post('read-all')
  @ApiOperation({
    summary: '알림 전부 읽음 처리',
    description:
      '알림함을 열 때 부른다. `readAt`이 없는 내 알림 전부에 지금 시각을 적는다. 배지가 0이 된다(D-81). `{ count }` 는 이번에 읽음이 된 수.',
  })
  async readAll(@CurrentUser() user: User) {
    const result = await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { count: result.count };
  }

  @Post(':id/read')
  @ApiOperation({
    summary: '알림 읽음 처리',
    description: '`readAt`을 기록한다. 배지는 읽지 않은 알림 수라(D-81) 하나 줄어든다.',
  })
  @ApiParam({ name: 'id', description: '알림 UUID' })
  async read(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.prisma.notification.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}

/**
 * 알림 딥링크 (design/20 §5.3, docs/07 §6).
 *
 * 모든 알림 링크가 이 하나의 형태다. 여기서
 *   1. 클릭을 기록하고 (docs/14 §2.4 채널별 클릭률)
 *   2. 로그인 여부를 확인하고
 *   3. 행동 화면으로 직행시킨다. 홈으로 보내고 다시 찾게 하지 않는다(FR-14.4).
 *
 * API 접두어 밖에 있다(main.ts의 exclude).
 */
@ApiTags('알림')
@Controller()
export class NotificationRedirectController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly session: SessionService,
    private readonly config: ConfigService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Get('n/:deliveryId')
  @ApiOperation({
    summary: '알림 딥링크 (302)',
    description:
      'Mattermost DM에 실리는 링크. `/api` 접두어 밖에 있다. 모든 알림 링크가 이 하나의 형태다(design/20 §5.3).\n\n' +
      '1. 클릭을 기록한다(`clickedAt`, 채널별 클릭률 측정)\n' +
      '2. 세션이 없으면 `/login?redirect=<targetPath>`로 보낸다\n' +
      '3. 세션이 있으면 알림의 `targetPath`(행동 화면)로 직행한다. 홈으로 보내고 다시 찾게 하지 않는다(FR-14.4)\n\n' +
      '없는 id면 `/notifications`로.',
  })
  @ApiParam({ name: 'deliveryId', description: '발송 건 id (NotificationDelivery)' })
  async open(
    @Param('deliveryId') deliveryId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const base = this.config.getOrThrow<string>('APP_BASE_URL');

    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: { notification: true },
    });

    if (!delivery) {
      response.redirect(`${base}/notifications`);
      return;
    }

    if (!delivery.clickedAt) {
      await this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: { clickedAt: new Date() },
      });
      this.analytics.track('notification.clicked', delivery.notification.userId, {
        deliveryId,
        type: delivery.notification.type,
        channel: delivery.channel,
      });
    }

    const target = delivery.notification.targetPath;

    // 로그인이 풀려 있으면 OAuth를 거친 뒤 원래 목적지로 돌아온다.
    const userId = this.session.readUserId(request);
    if (!userId) {
      response.redirect(
        `${base}/login?redirect=${encodeURIComponent(target)}`,
      );
      return;
    }

    response.redirect(`${base}${target}`);
  }
}

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
import type { User } from '@prisma/client';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/current-user.decorator';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthGuard, OnboardedGuard } from '../auth/auth.guard';
import { SessionService } from '../auth/session.service';
import { NOTIFICATION_RULES } from './notification.catalog';

@Controller('notifications')
@UseGuards(AuthGuard, OnboardedGuard)
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
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
   * 배지 = **처리가 필요한 것의 수**다(D-31). 단순 미읽음 수가 아니다.
   * 0이면 할 일이 없다는 뜻이어야 한다.
   */
  @Get('badge')
  async badge(@CurrentUser() user: User) {
    const count = await this.prisma.notification.count({
      where: { userId: user.id, actionRequired: true, resolvedAt: null },
    });
    return { count };
  }

  @Post(':id/read')
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
@Controller()
export class NotificationRedirectController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly session: SessionService,
    private readonly config: ConfigService,
  ) {}

  @Get('n/:deliveryId')
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

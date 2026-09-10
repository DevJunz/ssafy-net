import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SessionService } from './session.service';

export interface RequestWithUser extends Request {
  user: User;
}

/**
 * 세션 쿠키를 읽고 사용자 행을 매 요청 조회한다.
 * 세션 테이블이 없는 대신 이 조회가 탈퇴·정지의 즉시 반영을 보장한다
 * (design/20 §5.2, docs/09 §9, docs/12 §10).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly session: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = this.session.readUserId(request);
    if (!userId) throw new AppError('UNAUTHENTICATED');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status === 'WITHDRAWN') {
      throw new AppError('UNAUTHENTICATED');
    }

    this.touch(user);
    request.user = user;
    return true;
  }

  /**
   * `lastSeenAt` 을 한 시간에 한 번만 갱신한다. 로그인 때만 갱신하면 세션이 30일이라
   * 첫날 뒤로는 움직이지 않아 재방문을 알 수 없다(design/23 §7). 응답을 붙잡지 않는다.
   */
  private touch(user: User): void {
    const seen = user.lastSeenAt?.getTime() ?? 0;
    if (Date.now() - seen < LAST_SEEN_INTERVAL_MS) return;
    void this.prisma.user
      .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }
}

const LAST_SEEN_INTERVAL_MS = 60 * 60 * 1000;

/**
 * 온보딩을 마치기 전에는 그래프·추천·다른 사용자 조회에 갈 수 없다(FR-1.6).
 * 관심사 없는 사용자는 다른 사람에게도 보이지 않는다.
 */
@Injectable()
export class OnboardedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (user?.status !== 'ACTIVE') {
      throw new AppError('ONBOARDING_REQUIRED');
    }
    return true;
  }
}

/** 운영자는 일반 사용자와 같은 계정이고 표시만 다르다(docs/12 §9). */
@Injectable()
export class OperatorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!user?.isOperator) throw new AppError('FORBIDDEN');
    return true;
  }
}

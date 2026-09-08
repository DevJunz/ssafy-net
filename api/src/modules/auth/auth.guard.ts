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

    request.user = user;
    return true;
  }
}

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

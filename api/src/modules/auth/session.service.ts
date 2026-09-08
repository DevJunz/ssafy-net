import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions, Request, Response } from 'express';

export const SESSION_COOKIE = 'sn_session';
export const INVITE_COOKIE = 'sn_invite';

const SESSION_DAYS = 30;
const INVITE_MINUTES = 10;

/**
 * 세션은 httpOnly 쿠키에 담은 JWT다(design/20 §5.2).
 * 세션 테이블을 두지 않는 대신 매 요청 사용자 행을 읽어
 * 탈퇴·정지가 즉시 반영되게 한다(AuthGuard).
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private cookieOptions(maxAgeMs: number): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('NODE_ENV') === 'production',
      path: '/',
      maxAge: maxAgeMs,
    };
  }

  issueSession(response: Response, userId: string): void {
    const token = this.jwt.sign(
      { sub: userId },
      { expiresIn: `${SESSION_DAYS}d` },
    );
    response.cookie(
      SESSION_COOKIE,
      token,
      this.cookieOptions(SESSION_DAYS * 24 * 60 * 60 * 1000),
    );
  }

  clearSession(response: Response): void {
    response.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  readUserId(request: Request): string | null {
    const token = request.cookies?.[SESSION_COOKIE];
    if (!token) return null;
    try {
      return this.jwt.verify<{ sub: string }>(token).sub;
    } catch {
      return null;
    }
  }

  /** 초대 코드는 가입 순간에만 필요하다. 10분짜리 서명 쿠키로 들고 다닌다. */
  issueInvite(response: Response, code: string): void {
    const token = this.jwt.sign(
      { code },
      { expiresIn: `${INVITE_MINUTES}m` },
    );
    response.cookie(
      INVITE_COOKIE,
      token,
      this.cookieOptions(INVITE_MINUTES * 60 * 1000),
    );
  }

  readInviteCode(request: Request): string | null {
    const token = request.cookies?.[INVITE_COOKIE];
    if (!token) return null;
    try {
      return this.jwt.verify<{ code: string }>(token).code;
    } catch {
      return null;
    }
  }

  clearInvite(response: Response): void {
    response.clearCookie(INVITE_COOKIE, { path: '/' });
  }

  /** OAuth state에 복귀 주소를 담는다. 알림 딥링크가 로그인을 거쳐도 목적지를 잃지 않게(J6). */
  signState(redirect: string): string {
    return this.jwt.sign({ redirect }, { expiresIn: '10m' });
  }

  readState(state: string): string | null {
    try {
      return this.jwt.verify<{ redirect: string }>(state).redirect;
    } catch {
      return null;
    }
  }
}

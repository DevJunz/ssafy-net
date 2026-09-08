import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { GoogleService } from './google.service';
import { SessionService } from './session.service';

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleService,
    private readonly session: SessionService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 초대 링크 확인. 유효하면 10분짜리 초대 쿠키를 심는다.
   * 이 쿠키가 없는 신규 사용자는 콜백에서 막힌다(FR-0.2).
   */
  @Get('invites/:code')
  async checkInvite(
    @Param('code') code: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const invite = await this.auth.findActiveInvite(code);
    if (!invite) return { valid: false };

    this.session.issueInvite(response, code);
    return { valid: true };
  }

  @Get('auth/google')
  startGoogle(
    @Query('redirect') redirect: string | undefined,
    @Res() response: Response,
  ) {
    const state = this.session.signState(this.safePath(redirect));
    response.redirect(this.google.buildAuthUrl(state));
  }

  @Get('auth/google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const appBase = this.config.getOrThrow<string>('APP_BASE_URL');

    if (!code) {
      response.redirect(`${appBase}/login?error=cancelled`);
      return;
    }

    const identity = await this.google.exchangeCode(code);
    if (!identity) {
      response.redirect(`${appBase}/login?error=failed`);
      return;
    }

    const inviteCode = this.session.readInviteCode(request);

    try {
      const user = await this.auth.resolveUser(identity, inviteCode);
      this.session.issueSession(response, user.id);
      this.session.clearInvite(response);

      // 온보딩이 끝나기 전에는 어디로 가려 했든 온보딩부터 이어서 한다(J0).
      const destination =
        user.status === 'ACTIVE'
          ? (state ? this.session.readState(state) : null) ?? '/'
          : '/onboarding';

      response.redirect(`${appBase}${destination}`);
    } catch {
      response.redirect(`${appBase}/invite-required`);
    }
  }

  @Post('auth/logout')
  logout(@Res({ passthrough: true }) response: Response) {
    this.session.clearSession(response);
    return { ok: true };
  }

  /** 열린 리다이렉트를 막는다. 같은 앱 안의 경로만 허용한다. */
  private safePath(redirect: string | undefined): string {
    if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//')) {
      return '/';
    }
    return redirect;
  }
}

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
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { GoogleService } from './google.service';
import { SessionService } from './session.service';

@ApiTags('인증 · 초대')
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
  @ApiOperation({
    summary: '초대 링크 유효성 확인',
    description:
      '비로그인. 유효하면 `{ valid: true }`와 함께 서명된 초대 쿠키(`sn_invite`, 10분)를 심는다. ' +
      '신규 사용자는 Google 콜백에서 이 쿠키가 없으면 가입이 거부된다(FR-0.2, D-20). ' +
      '초대 코드는 `prisma:seed`가 출력한다.',
  })
  @ApiParam({ name: 'code', description: '초대 코드' })
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
  @ApiOperation({
    summary: 'Google 로그인 시작 (302)',
    description:
      '로그인은 Google만 지원한다(D-56). Google 동의 화면으로 302 리다이렉트한다. ' +
      '`redirect`는 로그인 후 돌아올 앱 내 경로이며 서명된 state에 실린다. ' +
      '`/`로 시작하지 않거나 `//`로 시작하면 열린 리다이렉트를 막기 위해 `/`로 바꾼다.',
  })
  @ApiQuery({
    name: 'redirect',
    required: false,
    description: '로그인 후 돌아올 앱 내 경로. 예: `/connections/received`',
  })
  startGoogle(
    @Query('redirect') redirect: string | undefined,
    @Res() response: Response,
  ) {
    const state = this.session.signState(this.safePath(redirect));
    response.redirect(this.google.buildAuthUrl(state));
  }

  @Get('auth/google/callback')
  @ApiOperation({
    summary: 'Google OAuth 콜백 (302)',
    description:
      'Google이 호출한다. 직접 호출하지 않는다. 코드를 교환해 사용자를 찾거나 만들고 세션 쿠키(`sn_session`)를 발급한다.\n\n' +
      '- 기존 사용자(ACTIVE): state의 redirect 경로로\n' +
      '- 온보딩 미완료: `/onboarding`으로 (어디로 가려 했든 온보딩부터, J0)\n' +
      '- 신규인데 초대 쿠키 없음: `/invite-required`로\n' +
      '- 취소·실패: `/login?error=cancelled|failed`로',
  })
  @ApiQuery({ name: 'code', required: false, description: 'Google 인가 코드' })
  @ApiQuery({ name: 'state', required: false, description: '서명된 state' })
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
  @ApiOperation({
    summary: '로그아웃',
    description: '세션 쿠키를 지운다. 세션이 없어도 200을 준다.',
  })
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

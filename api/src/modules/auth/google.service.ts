import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GoogleIdentity {
  sub: string;
  email: string | null;
  name: string | null;
}

/**
 * Google OAuth 2.0 Authorization Code (D-56 — 로그인은 Google만).
 *
 * passport를 쓰지 않고 직접 교환한다. 세션을 쿠키 JWT로 관리하므로
 * passport의 세션 계층이 필요 없고, 코드가 40줄이면 끝나기 때문이다.
 * id_token은 우리 client_secret으로 TLS 위에서 직접 교환해 받은 것이라
 * 별도 서명 검증 없이 신뢰한다.
 */
@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);

  constructor(private readonly config: ConfigService) {}

  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.getOrThrow('GOOGLE_CLIENT_ID'),
      redirect_uri: this.config.getOrThrow('GOOGLE_CALLBACK_URL'),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<GoogleIdentity | null> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.config.getOrThrow('GOOGLE_CLIENT_ID'),
        client_secret: this.config.getOrThrow('GOOGLE_CLIENT_SECRET'),
        redirect_uri: this.config.getOrThrow('GOOGLE_CALLBACK_URL'),
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      // Google이 주는 error / error_description을 그대로 남긴다.
      // invalid_client(자격 증명), invalid_grant(code 만료·재사용),
      // redirect_uri_mismatch를 구분하려면 본문이 있어야 한다.
      const detail = await response.text().catch(() => '');
      this.logger.warn(`토큰 교환 실패 ${response.status}: ${detail}`);
      return null;
    }

    const { id_token: idToken } = (await response.json()) as {
      id_token?: string;
    };
    if (!idToken) return null;

    return this.decodeIdToken(idToken);
  }

  private decodeIdToken(idToken: string): GoogleIdentity | null {
    const payload = idToken.split('.')[1];
    if (!payload) return null;

    try {
      const claims = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as { sub?: string; email?: string; name?: string };

      if (!claims.sub) return null;
      return {
        sub: claims.sub,
        email: claims.email ?? null,
        // 소셜 계정의 이름은 실명으로 확정하지 않는다(FR-0.3).
        // 온보딩에서 사내 메신저 실명을 따로 받는다.
        name: claims.name ?? null,
      };
    } catch {
      return null;
    }
  }
}

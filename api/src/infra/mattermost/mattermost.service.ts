import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Mattermost 발송기 (D-66).
 *
 * SSAFY Mattermost는 Team Edition이고 봇 계정과 개인 액세스 토큰이 모두 막혀 있다.
 * 쓸 수 있는 것은 **들어오는 웹훅** 하나뿐이고, 그래서 다음 제약을 안고 간다.
 *
 *   - 발송만 된다. 프로필 조회나 사용자 검색은 불가능하다.
 *   - 받는 사람에게는 **웹훅을 만든 사람(운영자)의 DM**으로 보인다. BOT 표시가 붙는다.
 *   - **웹훅 생성자 본인에게는 DM이 가지 않는다.** 200을 주고 기본 채널로 흘린다.
 *     운영자 계정만 예외 처리가 필요하다(실측으로 확인, 2026-09-08).
 *
 * 목적지를 지정하지 않으면 웹훅의 기본 채널로 간다. 그 채널은 운영자만 있는
 * 비공개 채널이어야 한다 — 코드에서 목적지를 빠뜨렸을 때의 폭발 반경이기 때문이다.
 */
@Injectable()
export class MattermostService {
  private readonly logger = new Logger(MattermostService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.get<string>('MATTERMOST_WEBHOOK_URL'));
  }

  /** 이 아이디는 웹훅 제약 때문에 DM을 받을 수 없다(웹훅 생성자). */
  get operatorUsername(): string | null {
    return this.config.get<string>('MATTERMOST_OPERATOR_USERNAME') ?? null;
  }

  canReceiveDirectMessage(username: string): boolean {
    const operator = this.operatorUsername;
    return !operator || normalize(username) !== normalize(operator);
  }

  /**
   * @아이디로 DM을 보낸다.
   * 없는 아이디면 Mattermost가 400을 주므로, 그것으로 오타를 걸러낼 수 있다.
   */
  async sendDirectMessage(
    username: string,
    markdown: string,
  ): Promise<{ ok: boolean; error?: string }> {
    return this.post({ channel: `@${normalize(username)}`, text: markdown });
  }

  /** 기본 채널로. 운영자만 보는 로그 용도다. */
  async sendToDefaultChannel(markdown: string): Promise<void> {
    await this.post({ text: markdown });
  }

  private async post(payload: {
    text: string;
    channel?: string;
  }): Promise<{ ok: boolean; error?: string }> {
    const url = this.config.get<string>('MATTERMOST_WEBHOOK_URL');
    if (!url) return { ok: false, error: 'MATTERMOST_WEBHOOK_URL 없음' };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) return { ok: true };

      const detail = (await response.text()).slice(0, 200);
      this.logger.warn(
        `발송 실패 ${response.status} → ${payload.channel ?? '(기본 채널)'}: ${detail}`,
      );
      return { ok: false, error: `${response.status}` };
    } catch (error) {
      this.logger.error(`발송 오류: ${String(error)}`);
      return { ok: false, error: 'network' };
    }
  }

  /** 대화창을 바로 여는 링크. 연결 성립 화면에서 "메신저에서 찾기"를 대체한다. */
  directMessageLink(username: string): string | null {
    const base = this.config.get<string>('MATTERMOST_URL');
    if (!base) return null;
    return `${base.replace(/\/$/, '')}/_redirect/messages/@${normalize(username)}`;
  }
}

/** 아이디는 소문자와 일부 기호만 쓴다. 입력값을 다듬어 오타 하나를 줄인다. */
export function normalize(username: string): string {
  return username.trim().replace(/^@/, '').toLowerCase();
}

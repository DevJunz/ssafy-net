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
/** 웹훅 응답 대기 상한. 평소 수백 ms 이내라 5초면 넉넉하다(design/23 §6). */
const WEBHOOK_TIMEOUT_MS = 5_000;

/** 아이디가 없을 때 Mattermost 가 주는 상태. 이것만 사용자 입력 오류다. */
export const MATTERMOST_UNKNOWN_USER = '400';

@Injectable()
export class MattermostService {
  private readonly logger = new Logger(MattermostService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.get<string>('MATTERMOST_WEBHOOK_URL'));
  }

  /**
   * 발송 모드. **기본값은 `redirect`이며, 이것이 의도한 안전장치다.**
   *
   *   redirect — 모든 DM이 운영자의 기본 채널로만 간다. 다른 사람에게는 아무것도
   *              가지 않는다. 받을 사람이 누구였는지는 메시지 머리에 적힌다.
   *   live     — 실제 상대에게 DM을 보낸다.
   *
   * 개발 중에 배치 잡이 잘못 돌면 수십 명에게 DM이 나갈 수 있다. 그 사고는
   * 되돌릴 수 없으므로, 위험한 쪽을 기본값으로 두지 않는다.
   * 공개할 때 `MATTERMOST_DELIVERY_MODE=live`로 명시적으로 바꾼다.
   */
  get deliveryMode(): 'redirect' | 'live' {
    return this.config.get<string>('MATTERMOST_DELIVERY_MODE') === 'live'
      ? 'live'
      : 'redirect';
  }

  /**
   * live 모드에서도 여기에 적힌 아이디에게만 보낸다. 비어 있으면 제한 없음.
   * 실사용 전 소수 인원으로 시험할 때 쓴다.
   */
  private get allowList(): string[] {
    const raw = this.config.get<string>('MATTERMOST_ALLOWED_RECIPIENTS') ?? '';
    return raw
      .split(',')
      .map((value) => normalize(value))
      .filter(Boolean);
  }

  /** 이 아이디는 웹훅 제약 때문에 DM을 받을 수 없다(웹훅 생성자). */
  get operatorUsername(): string | null {
    const value = this.config.get<string>('MATTERMOST_OPERATOR_USERNAME');
    return value ? normalize(value) : null;
  }

  canReceiveDirectMessage(username: string): boolean {
    const operator = this.operatorUsername;
    return !operator || normalize(username) !== operator;
  }

  /**
   * @아이디로 DM을 보낸다.
   * 없는 아이디면 Mattermost가 400을 주므로, 그것으로 오타를 걸러낼 수 있다.
   */
  async sendDirectMessage(
    username: string,
    markdown: string,
  ): Promise<{ ok: boolean; delivered: boolean; error?: string }> {
    const target = normalize(username);

    if (this.deliveryMode === 'redirect') {
      // 다른 사람에게는 보내지 않는다. 무엇이 나갔을지만 운영자에게 보여준다.
      const result = await this.post({
        text: [
          `> **[전송 안 함]** \`@${target}\` 에게 갈 메시지입니다.`,
          '> _MATTERMOST_DELIVERY_MODE=live 로 바꾸면 실제로 발송됩니다._',
          '',
          markdown,
        ].join('\n'),
      });
      return { ...result, delivered: false };
    }

    const allowed = this.allowList;
    if (allowed.length > 0 && !allowed.includes(target)) {
      this.logger.warn(`허용 목록에 없어 발송하지 않음: @${target}`);
      await this.post({
        text: `> **[전송 안 함]** \`@${target}\` 은 허용 목록에 없습니다.`,
      });
      return { ok: true, delivered: false };
    }

    const result = await this.post({ channel: `@${target}`, text: markdown });
    return { ...result, delivered: result.ok };
  }

  /** 기본 채널로. 운영자만 보는 로그 용도다. */
  async sendToDefaultChannel(markdown: string): Promise<void> {
    await this.post({ text: markdown });
  }

  /**
   * 웹훅 호출 한 번.
   *
   * `error` 는 세 부류다(design/23 §6). 호출하는 쪽이 이것으로 문구와 재시도를 가른다.
   *   - `'400'`            : 없는 아이디. 사용자 입력 오류라 재시도해도 소용없다.
   *   - 그 밖의 상태 코드  : Mattermost 쪽 문제(429, 5xx). 재시도 대상.
   *   - `'timeout'`·`'network'` : 응답이 없거나 연결이 안 됨. 재시도 대상.
   *
   * 타임아웃이 없으면 Mattermost 가 느려질 때 요청이 매달리고 온보딩 전체가 선다.
   */
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
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });

      if (response.ok) return { ok: true };

      const detail = (await response.text()).slice(0, 200);
      this.logger.warn(
        `발송 실패 ${response.status} → ${payload.channel ?? '(기본 채널)'}: ${detail}`,
      );
      return { ok: false, error: `${response.status}` };
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      this.logger.error(
        `발송 오류(${timedOut ? 'timeout' : 'network'}): ${String(error)}`,
      );
      return { ok: false, error: timedOut ? 'timeout' : 'network' };
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

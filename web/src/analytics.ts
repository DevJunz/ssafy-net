import type { ClientEventName, TrackEventsInput } from '@ssafy-net/shared';
import { DEMO_MODE } from './mocks';

/**
 * 화면 안에서만 일어나는 사건을 모아 `POST /api/events` 로 보낸다(design/22 §14).
 *
 * 서버가 볼 수 있는 것(열람)은 서버가 기록한다. 여기서는 클릭만 보낸다(shared/events.ts).
 * 측정은 앱을 절대 깨뜨리면 안 된다 — 모든 오류를 삼킨다. 데모 빌드는 아무것도 하지 않는다.
 */

type QueuedEvent = TrackEventsInput['events'][number];

const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_AT = 20;
const SESSION_KEY = 'sn-analytics-session';

let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let sessionId: string | undefined;

/** 탭 하나가 세션 하나다. sessionStorage 는 탭마다 따로다. */
function sessionIdOf(): string | undefined {
  if (sessionId) return sessionId;
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      sessionId = stored;
      return stored;
    }
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, fresh);
    sessionId = fresh;
    return fresh;
  } catch {
    return undefined;
  }
}

function flush(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;

  const body: TrackEventsInput = { events: queue, sessionId: sessionIdOf() };
  queue = [];

  try {
    void fetch('/api/events', {
      method: 'POST',
      credentials: 'include',
      // 탭이 닫히는 중에도 요청이 끝까지 간다.
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch {
    /* 측정은 앱을 깨뜨리지 않는다 */
  }
}

export function track(name: ClientEventName, props?: Record<string, unknown>): void {
  if (DEMO_MODE) return;
  try {
    queue.push({ name, props, occurredAt: new Date().toISOString() });
    if (queue.length >= FLUSH_AT) {
      flush();
      return;
    }
    if (!timer) timer = setTimeout(flush, FLUSH_INTERVAL_MS);
  } catch {
    /* 무시 */
  }
}

if (!DEMO_MODE && typeof document !== 'undefined') {
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    // 사파리는 visibilitychange 가 안 올 때가 있다.
    window.addEventListener('pagehide', flush);
  } catch {
    /* 무시 */
  }
}

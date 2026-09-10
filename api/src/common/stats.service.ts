import { Global, Injectable, Module } from '@nestjs/common';

/**
 * 프로세스 메모리 안의 카운터. 운영자 대시보드의 "서버" 블록이 읽는다(D-77, design/23 §7).
 *
 * 로그를 뒤지지 않고 오류율·느린 요청·웹훅 실패를 보기 위한 것이다. 재시작하면 0 부터 센다 —
 * 그래서 `since` 를 같이 준다. 하루치 시각별 통은 24개만 돌려 쓴다.
 * 표에 남기지 않는 이유: 요청마다 insert 를 하면 그것이 부하가 된다. 하루 수만 건이면 메모리로 충분하다.
 */

const SLOW_MS = 1000;
const RECENT_MAX = 50;
const SAMPLE_MAX = 2000;

interface HourBucket {
  hour: string; // ISO 시 단위 (UTC). 화면이 KST 로 바꾼다
  total: number;
  status5xx: number;
  slow: number;
}

interface RecentError {
  at: string;
  method: string;
  path: string;
  status: number;
  ms: number;
}

interface WebhookSample {
  at: string;
  ok: boolean;
  error: string | null;
  ms: number;
}

/** 지연 시간 표본. 상한을 두고 오래된 것부터 버린다(p95 계산용). */
class Reservoir {
  private samples: number[] = [];
  private sum = 0;
  private n = 0;

  push(ms: number): void {
    this.sum += ms;
    this.n += 1;
    this.samples.push(ms);
    if (this.samples.length > SAMPLE_MAX) this.samples.shift();
  }

  get avg(): number | null {
    return this.n === 0 ? null : Math.round(this.sum / this.n);
  }

  get p95(): number | null {
    if (this.samples.length === 0) return null;
    const sorted = [...this.samples].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  }
}

@Injectable()
export class StatsService {
  readonly since = new Date().toISOString();

  // ── HTTP
  private httpTotal = 0;
  private http4xx = 0;
  private http5xx = 0;
  private httpSlow = 0;
  private invite404 = 0;
  private unauthenticated = 0;
  private readonly httpLatency = new Reservoir();
  private readonly hours = new Map<string, HourBucket>();
  private readonly recentErrors: RecentError[] = [];

  // ── Mattermost 웹훅
  private webhookOk = 0;
  private webhookFailed = 0;
  private readonly webhookErrors = new Map<string, number>();
  private readonly webhookLatency = new Reservoir();
  private readonly webhookRecent: WebhookSample[] = [];

  recordHttp(input: {
    method: string;
    path: string;
    status: number;
    ms: number;
  }): void {
    const { method, path, status, ms } = input;
    this.httpTotal += 1;
    this.httpLatency.push(ms);
    if (status >= 500) this.http5xx += 1;
    else if (status >= 400) this.http4xx += 1;
    if (ms >= SLOW_MS) this.httpSlow += 1;
    if (status === 404 && path.startsWith('/api/invites/')) this.invite404 += 1;
    if (status === 401) this.unauthenticated += 1;

    const hour = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString();
    const bucket = this.hours.get(hour) ?? { hour, total: 0, status5xx: 0, slow: 0 };
    bucket.total += 1;
    if (status >= 500) bucket.status5xx += 1;
    if (ms >= SLOW_MS) bucket.slow += 1;
    this.hours.set(hour, bucket);
    if (this.hours.size > 24) {
      const oldest = [...this.hours.keys()].sort()[0];
      this.hours.delete(oldest);
    }

    if (status >= 500 || ms >= SLOW_MS) {
      this.recentErrors.unshift({
        at: new Date().toISOString(),
        method,
        path: path.slice(0, 120),
        status,
        ms,
      });
      if (this.recentErrors.length > RECENT_MAX) this.recentErrors.pop();
    }
  }

  recordWebhook(input: { ok: boolean; error?: string; ms: number }): void {
    const { ok, error, ms } = input;
    this.webhookLatency.push(ms);
    if (ok) this.webhookOk += 1;
    else {
      this.webhookFailed += 1;
      const key = error ?? 'unknown';
      this.webhookErrors.set(key, (this.webhookErrors.get(key) ?? 0) + 1);
    }
    this.webhookRecent.unshift({
      at: new Date().toISOString(),
      ok,
      error: ok ? null : (error ?? 'unknown'),
      ms,
    });
    if (this.webhookRecent.length > 20) this.webhookRecent.pop();
  }

  http() {
    return {
      since: this.since,
      total: this.httpTotal,
      status4xx: this.http4xx,
      status5xx: this.http5xx,
      slow: this.httpSlow,
      avgMs: this.httpLatency.avg,
      p95Ms: this.httpLatency.p95,
      hourly: [...this.hours.values()].sort((a, b) => a.hour.localeCompare(b.hour)),
      recentErrors: [...this.recentErrors],
      invite404: this.invite404,
      unauthenticated: this.unauthenticated,
    };
  }

  webhook() {
    return {
      since: this.since,
      ok: this.webhookOk,
      failed: this.webhookFailed,
      byError: [...this.webhookErrors.entries()]
        .map(([error, count]) => ({ error, count }))
        .sort((a, b) => b.count - a.count),
      avgMs: this.webhookLatency.avg,
      p95Ms: this.webhookLatency.p95,
      recent: [...this.webhookRecent],
    };
  }
}

@Global()
@Module({ providers: [StatsService], exports: [StatsService] })
export class StatsModule {}

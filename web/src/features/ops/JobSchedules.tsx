import type { OpsJobSchedule } from '@ssafy-net/shared';
import { OPS_JOB_HOURS_MAX } from '@ssafy-net/shared';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '../../api/client';
import { Muted } from '../../components/primitives';
import { Section } from './charts';

/**
 * 알림 시각 (D-96) — 09·18시처럼 정해진 시각에 나가는 배치를 끄고 켜고 시각을 바꾼다.
 *
 * 화면이 계산하는 것은 "다음 발송이 언제인가" 하나뿐이고, 나머지는 서버가 준 것을 그대로 보여준다.
 * 시각은 KST 정각이다 — 분을 고르게 하지 않는 이유는 서버 쪽 주석(`jobs.service.ts`)에 있다.
 */

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const KST_OFFSET_MS = 9 * 3_600_000;

const pad = (hour: number) => String(hour).padStart(2, '0');
const label = (hours: number[]) => (hours.length === 0 ? '시각 없음' : hours.map((h) => `${pad(h)}:00`).join(' · '));
const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const errorText = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

/** 다음 발송. 운영자의 컴퓨터가 KST 가 아닐 수도 있어 시차를 직접 더한다 */
function nextRun(hours: number[]): string {
  if (hours.length === 0) return '없음';
  const hourNow = new Date(Date.now() + KST_OFFSET_MS).getUTCHours();
  const today = hours.find((hour) => hour > hourNow);
  return today !== undefined ? `오늘 ${pad(today)}:00` : `내일 ${pad(hours[0])}:00`;
}

export function JobSchedulesSection() {
  const [items, setItems] = useState<OpsJobSchedule[] | null>(null);
  // 고르는 중인 시각. 저장하기 전까지는 여기에만 있다
  const [draft, setDraft] = useState<Record<string, number[]>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api.get<OpsJobSchedule[]>('/admin/ops/schedules');
      setItems(rows);
      setDraft(Object.fromEntries(rows.map((row) => [row.name, row.hours])));
    } catch (cause) {
      toast.error(errorText(cause));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (item: OpsJobSchedule, next: { enabled: boolean; hours: number[] }, done: string) => {
    setBusy(item.name);
    try {
      const saved = await api.put<OpsJobSchedule>(`/admin/ops/schedules/${item.name}`, next);
      setItems((rows) => (rows ?? []).map((row) => (row.name === saved.name ? saved : row)));
      setDraft((rows) => ({ ...rows, [saved.name]: saved.hours }));
      toast.success(done);
    } catch (cause) {
      toast.error(errorText(cause));
    } finally {
      setBusy(null);
    }
  };

  const toggleHour = (name: string, hour: number) => {
    setDraft((rows) => {
      const current = rows[name] ?? [];
      const next = current.includes(hour)
        ? current.filter((value) => value !== hour)
        : [...current, hour].sort((a, b) => a - b);
      if (next.length > OPS_JOB_HOURS_MAX) {
        toast.error(`시각은 ${OPS_JOB_HOURS_MAX}개까지 고를 수 있습니다`);
        return rows;
      }
      return { ...rows, [name]: next };
    });
  };

  return (
    <Section
      title="알림 시각"
      description="정해진 시각에 나가는 알림. 끄면 그 알림이 나가지 않고, 시각을 바꾸면 다음 정각부터 그 시각에 나간다. 연결 요청·수락 같은 즉시 알림은 여기에 없다"
    >
      {!items ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        items.map((item) => {
          const hours = draft[item.name] ?? item.hours;
          const dirty = !same(hours, item.hours);
          const working = busy === item.name;

          return (
            <div key={item.name} className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold">{item.label}</span>
                <Badge variant={item.enabled ? 'default' : 'secondary'}>
                  {item.enabled ? label(item.hours) : '꺼짐'}
                </Badge>
                {item.enabled && !dirty && (
                  <Muted className="text-[12.5px]">다음 발송 {nextRun(item.hours)}</Muted>
                )}
                <code className="ml-auto text-[11.5px] text-muted-foreground">{item.name}</code>
              </div>

              <Muted className="text-[12.5px]">{item.description}</Muted>

              <div className="flex flex-wrap gap-1">
                {HOURS.map((hour) => {
                  const on = hours.includes(hour);
                  return (
                    <Button
                      key={hour}
                      type="button"
                      size="sm"
                      variant={on ? 'default' : 'outline'}
                      disabled={working}
                      className="h-7 w-10 px-0 text-[12px] tabular-nums"
                      aria-pressed={on}
                      onClick={() => toggleHour(item.name, hour)}
                    >
                      {pad(hour)}
                    </Button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={working || !dirty}
                  onClick={() =>
                    void save(
                      item,
                      { enabled: item.enabled, hours },
                      item.enabled
                        ? `${item.label} — ${label(hours)} 에 나갑니다`
                        : `${item.label} 시각을 ${label(hours)} 로 두었습니다 (지금은 꺼짐)`,
                    )
                  }
                >
                  {working ? '저장 중…' : dirty ? `${label(hours)} 로 저장` : '저장됨'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={working}
                  onClick={() =>
                    void save(
                      item,
                      { enabled: !item.enabled, hours },
                      item.enabled
                        ? `${item.label}을(를) 껐습니다`
                        : `${item.label}을(를) 켰습니다 — ${label(hours)}`,
                    )
                  }
                >
                  {item.enabled ? '끄기' : '켜기'}
                </Button>
                {(!item.isDefault || dirty) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={working}
                    onClick={() =>
                      void save(
                        item,
                        { enabled: true, hours: item.defaultHours },
                        `기본값으로 되돌렸습니다 — ${label(item.defaultHours)}`,
                      )
                    }
                  >
                    기본값으로({label(item.defaultHours)})
                  </Button>
                )}
                {dirty && <Muted className="text-[12.5px]">아직 저장하지 않았습니다</Muted>}
              </div>

              <Muted className="text-[12.5px]">{item.offNote}</Muted>
            </div>
          );
        })
      )}

      <Muted className="text-[12.5px]">
        주말에는 메신저 DM 이 미뤄지는 것이 먼저다(D-95) — 토·일에 이 시각이 와도 알림함에만 쌓이고 DM 은 월요일 요약이
        가져갑니다. 꺼도 손으로는 돌릴 수 있습니다 — 네트워크 추천은 제품 탭의 &quot;지금 다시 계산&quot;, 가입 직후 노출도
        그대로입니다. 게이트 판정(09:05)과 주말 요약(월 09:00)은 시각이 다른 규칙에 매여 있어 여기서 바꾸지 않습니다.
      </Muted>
    </Section>
  );
}

import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * 운영 화면(/ops)의 작은 조각들. 의존성 없이 HTML/CSS 로 그린다.
 *
 * 색은 index.css 의 차트 토큰만 쓴다. 한 계열 = 파랑(--chart-1), 강조 대비 회색(--input),
 * 둘째·셋째 계열 = 초록(--chart-3)·주황(--chart-5). 실패·오류 상태만 --destructive.
 * (파랑·초록·주황 셋은 색약 분리 검사를 통과한 조합이다.)
 */

export const SERIES = {
  primary: 'var(--chart-1)',
  second: 'var(--chart-3)',
  third: 'var(--chart-5)',
  muted: 'var(--input)',
  bad: 'var(--destructive)',
} as const;

// ── 형식 ───────────────────────────────────────────────────

export const fmtNum = (n: number): string => n.toLocaleString('ko-KR');

export const fmtPct = (rate: number | null | undefined): string =>
  rate === null || rate === undefined || Number.isNaN(rate)
    ? '–'
    : `${(rate * 100).toFixed(1)} %`;

/** 'YYYY-MM-DD' → 'MM-DD' */
export const fmtDay = (day: string): string => (day.length >= 10 ? day.slice(5, 10) : day);

const kstFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** ISO → KST 'MM-DD HH:mm' */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '–';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '–';
  const parts = kstFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

const clockFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Date → 'HH:MM:SS' (KST) */
export function fmtClock(date: Date): string {
  const parts = clockFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('hour')}:${get('minute')}:${get('second')}`;
}

export function fmtMb(mb: number | null | undefined): string {
  if (mb === null || mb === undefined) return '–';
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 10) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1)} MB`;
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '–';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.round(ms)} ms`;
}

export function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}일 ${h}시간`;
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

export function fmtHours(hours: number | null): string {
  if (hours === null) return '–';
  if (hours < 1) return `${Math.round(hours * 60)}분`;
  return `${hours.toFixed(1)}시간`;
}

// ── 틀 ───────────────────────────────────────────────────

export function Section({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('gap-4 py-5 shadow-xs', className)}>
      <CardHeader className="px-5">
        <CardTitle className="text-[15px]">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-5">{children}</CardContent>
    </Card>
  );
}

export function Tiles({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** 수치 하나. 값은 글자색 토큰만 쓴다 — 상태 의미가 있을 때만 destructive. */
export function StatTile({
  label,
  value,
  hint,
  tone = 'plain',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'plain' | 'bad' | 'good';
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-card px-3.5 py-3">
      <div className="truncate text-[12px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-1 truncate text-[21px] leading-tight font-semibold',
          tone === 'bad' && 'text-destructive',
          tone === 'good' && 'text-accent-foreground',
        )}
      >
        {value}
      </div>
      {hint !== undefined && (
        <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

export function Empty({ children = '아직 없음' }: { children?: ReactNode }) {
  return <p className="text-[13px] text-muted-foreground">{children}</p>;
}

// ── 표 ───────────────────────────────────────────────────

export function DataTable({
  head,
  rows,
  empty,
  align,
}: {
  head: ReactNode[];
  rows: ReactNode[][];
  empty?: string;
  /** 열별 정렬. 기본 왼쪽. 숫자 열은 'right' */
  align?: ('left' | 'right')[];
}) {
  if (rows.length === 0) return <Empty>{empty ?? '아직 없음'}</Empty>;
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[480px] border-collapse text-[13px]">
        <thead>
          <tr className="bg-secondary text-[11.5px] font-semibold tracking-wide text-muted-foreground">
            {head.map((cell, i) => (
              <th
                key={i}
                className={cn(
                  'px-3 py-2 font-semibold whitespace-nowrap',
                  align?.[i] === 'right' ? 'text-right' : 'text-left',
                )}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-t">
              {row.map((cell, c) => (
                <td
                  key={c}
                  className={cn(
                    'px-3 py-1.5 align-top',
                    align?.[c] === 'right' ? 'text-right tabular-nums' : 'text-left',
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 세로 막대 ─────────────────────────────────────────────

export interface ColumnSeries {
  name: string;
  color: string;
}

export interface ColumnDatum {
  /** 축 아래 글자 */
  label: string;
  /** hover 툴팁의 머리말. 없으면 label */
  title?: string;
  /** 계열별 값. 아래부터 쌓인다 */
  values: number[];
}

/**
 * 막대 ≤ 24px, 끝은 4px 둥글게, 조각 사이 2px 여백. 값 표시는 최댓값과 마지막만.
 * 계열이 둘 이상이면 범례를 붙인다.
 */
export function Columns({
  data,
  series,
  height = 120,
  tickEvery = 1,
  stacked = true,
}: {
  data: ColumnDatum[];
  series: ColumnSeries[];
  height?: number;
  /** 몇 칸마다 축 글자를 쓰나 */
  tickEvery?: number;
  /** false 면 계열을 나란히 그린다 */
  stacked?: boolean;
}) {
  if (data.length === 0) return <Empty />;

  const totals = data.map((d) => (stacked ? d.values.reduce((a, b) => a + b, 0) : Math.max(...d.values)));
  const max = Math.max(1, ...totals);
  const maxIndex = totals.indexOf(Math.max(...totals));
  const last = data.length - 1;

  return (
    <div className="flex flex-col gap-2">
      {series.length > 1 && <Legend series={series} />}
      <div className="flex items-end gap-[2px]" style={{ height: height + 16 }}>
        {data.map((d, i) => {
          const total = totals[i];
          const showValue = total > 0 && (i === maxIndex || i === last);
          const tip = `${d.title ?? d.label}: ${series
            .map((s, k) => `${s.name} ${fmtNum(d.values[k] ?? 0)}`)
            .join(' · ')}`;
          return (
            <div
              key={i}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              title={tip}
            >
              <span
                className={cn(
                  'mb-0.5 h-3.5 text-[10px] leading-[14px] whitespace-nowrap tabular-nums text-muted-foreground',
                  !showValue && 'invisible',
                )}
              >
                {fmtNum(total)}
              </span>
              {stacked ? (
                <div
                  className="flex w-full max-w-[24px] flex-col-reverse"
                  style={{ height }}
                >
                  {d.values.map((v, k) => {
                    const pct = (v / max) * 100;
                    // 위에 조각이 더 있으면 끝을 둥글게 하지 않는다
                    const topmost = d.values.slice(k + 1).every((x) => x <= 0);
                    return (
                      <div
                        key={k}
                        className={cn(
                          'w-full shrink-0',
                          topmost && 'rounded-t-[4px]',
                          k > 0 && v > 0 && 'mt-[2px]',
                        )}
                        style={{
                          height: `${pct}%`,
                          background: series[k]?.color,
                          minHeight: v > 0 ? 2 : 0,
                        }}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="flex w-full max-w-[40px] items-end gap-[2px]" style={{ height }}>
                  {d.values.map((v, k) => (
                    <div
                      key={k}
                      className="max-w-[24px] flex-1 rounded-t-[4px]"
                      style={{
                        height: `${(v / max) * 100}%`,
                        background: series[k]?.color,
                        minHeight: v > 0 ? 2 : 0,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-[2px]">
        {data.map((d, i) => (
          <div
            key={i}
            className="min-w-0 flex-1 truncate text-center text-[10px] tabular-nums text-muted-foreground"
          >
            {i % tickEvery === 0 || i === last ? d.label : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend({ series }: { series: ColumnSeries[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
      {series.map((s) => (
        <span key={s.name} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-[3px]"
            style={{ background: s.color }}
            aria-hidden="true"
          />
          {s.name}
        </span>
      ))}
    </div>
  );
}

// ── 가로 막대 ─────────────────────────────────────────────

export function HBars({
  items,
  color = SERIES.primary,
  format = fmtNum,
}: {
  items: { label: string; value: number; sub?: ReactNode }[];
  color?: string;
  format?: (value: number) => string;
}) {
  if (items.length === 0) return <Empty />;
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 text-[13px]">
          <div className="w-[120px] shrink-0 truncate max-sm:w-[88px]" title={item.label}>
            {item.label}
          </div>
          <div className="h-[14px] min-w-0 flex-1">
            <div
              className="h-full rounded-r-[4px]"
              style={{
                width: `${(item.value / max) * 100}%`,
                background: color,
                minWidth: item.value > 0 ? 2 : 0,
              }}
            />
          </div>
          <div className="w-[64px] shrink-0 text-right tabular-nums">{format(item.value)}</div>
          {item.sub !== undefined && (
            <div className="w-[56px] shrink-0 text-right text-[12px] tabular-nums text-muted-foreground max-sm:hidden">
              {item.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** 온보딩처럼 단계가 줄어드는 것. 첫 단계를 100 으로 본다 */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const base = Math.max(1, steps[0]?.value ?? 0);
  return (
    <div className="flex flex-col gap-1.5">
      {steps.map((step, i) => {
        // 비율은 첫 단계 대비다. 앞 단계 대비로 하면 시드처럼 중간 단계가 빈 데이터에서 100%를 넘는다.
        const first = steps[0]?.value ?? 0;
        const rate = first > 0 ? Math.min(1, step.value / first) : null;
        return (
          <div key={step.label} className="flex items-center gap-2 text-[13px]">
            <div className="w-[120px] shrink-0 truncate max-sm:w-[88px]">{step.label}</div>
            <div className="h-[14px] min-w-0 flex-1">
              <div
                className="h-full rounded-r-[4px]"
                style={{
                  width: `${Math.min(100, (step.value / base) * 100)}%`,
                  background: SERIES.primary,
                  minWidth: step.value > 0 ? 2 : 0,
                }}
              />
            </div>
            <div className="w-[64px] shrink-0 text-right tabular-nums">{fmtNum(step.value)}</div>
            <div className="w-[56px] shrink-0 text-right text-[12px] tabular-nums text-muted-foreground max-sm:hidden">
              {i === 0 ? '' : fmtPct(rate)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

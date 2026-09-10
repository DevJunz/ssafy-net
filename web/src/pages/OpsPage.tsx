import type { OpsJob, OpsMetrics, OpsRequestEntry } from '@ssafy-net/shared';
import { RefreshCwIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '../api/client';
import {
  ErrorText,
  Muted,
  PageTitle,
  ScrollPage,
  SectionLabel,
} from '../components/primitives';
import {
  Columns,
  DataTable,
  Empty,
  Funnel,
  HBars,
  SERIES,
  Section,
  StatTile,
  Tiles,
  fmtClock,
  fmtDay,
  fmtHours,
  fmtMb,
  fmtMs,
  fmtNum,
  fmtPct,
  fmtTime,
  fmtUptime,
} from '../features/ops/charts';

/**
 * 운영자 대시보드 (D-77). `GET /api/admin/ops?days=N` 하나를 그린다.
 *
 * 왼쪽 탭 **제품** 은 PM 이 매일 보는 것(docs/14 §4·§5), **서버** 는 조용히 죽는 곳(design/23).
 * 서버가 계산한 값을 그대로 보여준다. 여기서 다시 계산하지 않는다.
 */

const PERIODS = [7, 14, 28] as const;
const REFRESH_MS = 60_000;

const ENTRY_LABEL: Record<OpsRequestEntry, string> = {
  SIMILAR: '비슷한 사람',
  INTEREST_DETAIL: '관심사 상세',
  PROFILE: '프로필',
  POST: '글',
  GRAPH: '그래프',
  NETWORK_FAILED: '네트워크 미성립',
};

const WEEKDAY = ['월', '화', '수', '목', '금', '토', '일'];

/** UTC ISO 시각 통 → KST 시(00~23). 서버의 시각별 HTTP 카운터가 UTC 로 온다. */
function kstHour(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return String((date.getUTCHours() + 9) % 24).padStart(2, '0');
}

export default function OpsPage() {
  const [days, setDays] = useState<number>(14);
  const [data, setData] = useState<OpsMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const result = await api.get<OpsMetrics>(`/admin/ops?days=${days}`);
      setData(result);
      setError(null);
      setUpdatedAt(new Date());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    setData(null);
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  return (
    <ScrollPage>
      <main className="mx-auto w-full max-w-[1120px] px-6 pt-8 pb-24 max-sm:px-3 max-sm:pt-5">
        <div className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="min-w-0">
            <PageTitle className="mb-0">운영</PageTitle>
            <Muted className="text-[12.5px]">
              {updatedAt ? `마지막 갱신 ${fmtClock(updatedAt)}` : '불러오는 중…'}
              {data && ` · 서버 생성 ${fmtTime(data.generatedAt)}`}
              {' · 1분마다 다시 받는다'}
            </Muted>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <TabsList aria-label="집계 기간">
                {PERIODS.map((p) => (
                  <TabsTrigger key={p} value={String(p)}>
                    {p}일
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
              aria-label="다시 받기"
            >
              <RefreshCwIcon className={loading ? 'animate-spin' : undefined} />
              <span className="max-sm:hidden">다시 받기</span>
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-card px-4 py-3">
            <ErrorText className="m-0">불러오지 못했습니다: {error}</ErrorText>
            <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
              다시 시도
            </Button>
          </div>
        )}

        {!data ? (
          error ? null : <LoadingSkeleton />
        ) : (
          <Tabs defaultValue="product">
            <TabsList className="mb-3">
              <TabsTrigger value="product">제품</TabsTrigger>
              <TabsTrigger value="server">서버</TabsTrigger>
            </TabsList>
            <TabsContent value="product">
              <ProductTab data={data} />
            </TabsContent>
            <TabsContent value="server">
              <ServerTab data={data} />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </ScrollPage>
  );
}

export { OpsPage };

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[76px]" />
        ))}
      </div>
      <Skeleton className="h-[220px]" />
      <Skeleton className="h-[220px]" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 제품
// ─────────────────────────────────────────────────────────

function ProductTab({ data }: { data: OpsMetrics }) {
  const p = data.product;
  const r = p.requests;
  const tick = data.days > 14 ? 4 : data.days > 7 ? 2 : 1;

  return (
    <div className="flex flex-col gap-3">
      <Tiles>
        <StatTile label="오늘 성립 (North Star)" value={fmtNum(p.northStar.today)} hint={`어제 ${fmtNum(p.northStar.yesterday)}`} />
        <StatTile label={`${data.days}일 성립`} value={fmtNum(p.northStar.windowTotal)} hint={`누적 ${fmtNum(p.northStar.allTime)}`} />
        <StatTile label="요청 수락률" value={fmtPct(r.acceptRate)} hint={`대기 중 ${fmtNum(r.totals.pending)}`} />
        <StatTile
          label={'"대화 시작" 응답 (가드레일)'}
          value={fmtPct(p.guardrail.startedRate)}
          hint={`목표 50 % 이상 · 응답률 ${fmtPct(p.guardrail.responseRate)}`}
          tone={
            p.guardrail.startedRate === null
              ? 'plain'
              : p.guardrail.startedRate >= 0.5
                ? 'good'
                : 'bad'
          }
        />
        <StatTile label="오늘 활동" value={fmtNum(p.activity.activeToday)} hint={`주간 ${fmtNum(p.activity.wau)}`} />
        <StatTile label="온보딩 완료" value={fmtNum(p.onboarding.completed)} hint={`가입 ${fmtNum(p.onboarding.signedUp)} · 인증 ${fmtNum(p.onboarding.verified)}`} />
        <StatTile label="직접 추가한 관심사" value={fmtNum(p.interests.userCreated)} hint={`활성 ${fmtNum(p.interests.totalActive)}`} />
        <StatTile
          label="2주차 재방문"
          value={fmtPct(p.activity.week2Return.rate)}
          hint={`${fmtNum(p.activity.week2Return.returned)} / ${fmtNum(p.activity.week2Return.eligible)}`}
        />
      </Tiles>

      <Section
        title="신규 성립 연결"
        description="1:1 성립 1건 = 1, Network 성립 1건 = 참여 인원 수 (docs/14 §4)"
      >
        <Columns
          data={p.northStar.byDay.map((d) => ({ label: fmtDay(d.day), title: d.day, values: [d.count] }))}
          series={[{ name: '성립', color: SERIES.primary }]}
          tickEvery={tick}
        />
      </Section>

      <Section title="연결 요청" description="보낸 요청 중 수락된 것. 나머지는 거절·만료·취소·대기">
        <Tiles>
          <StatTile label="보냄" value={fmtNum(r.totals.sent)} />
          <StatTile label="수락" value={fmtNum(r.totals.accepted)} />
          <StatTile label="거절" value={fmtNum(r.totals.rejected)} />
          <StatTile label="만료" value={fmtNum(r.totals.expired)} hint="받은 쪽이 앱을 안 연 신호" />
          <StatTile label="취소" value={fmtNum(r.totals.cancelled)} />
          <StatTile label="대기 중" value={fmtNum(r.totals.pending)} />
          <StatTile label="오늘 상한 도달" value={fmtNum(r.capReachedToday)} hint="일 상한(P-06)에 닿은 사람" tone={r.capReachedToday > 0 ? 'bad' : 'plain'} />
        </Tiles>
        <Columns
          data={r.byDay.map((d) => ({
            label: fmtDay(d.day),
            title: d.day,
            values: [d.accepted, Math.max(0, d.sent - d.accepted)],
          }))}
          series={[
            { name: '수락', color: SERIES.primary },
            { name: '그 외(거절·만료·취소·대기)', color: SERIES.muted },
          ]}
          tickEvery={tick}
        />
        <div>
          <SectionLabel>어느 길에서 요청이 나오나</SectionLabel>
          <DataTable
            head={['진입점', '보냄', '수락', '수락률', '열람', '열람→요청']}
            align={['left', 'right', 'right', 'right', 'right', 'right']}
            rows={r.byEntry.map((e) => [
              ENTRY_LABEL[e.entry] ?? e.entry,
              fmtNum(e.sent),
              fmtNum(e.accepted),
              fmtPct(e.acceptRate),
              e.views === null ? '–' : fmtNum(e.views),
              fmtPct(e.conversion),
            ])}
          />
        </div>
        {r.byEntry.some((e) => e.conversion !== null) && (
          <div>
            <SectionLabel>열람 대비 요청 (전환율)</SectionLabel>
            <HBars
              items={r.byEntry
                .filter((e) => e.conversion !== null)
                .map((e) => ({
                  label: ENTRY_LABEL[e.entry] ?? e.entry,
                  value: e.conversion ?? 0,
                  sub: `${fmtNum(e.sent)}건`,
                }))}
              format={fmtPct}
            />
          </div>
        )}
        <div>
          <SectionLabel>공통 관심사 개수별 (P-03 조정 근거)</SectionLabel>
          <DataTable
            head={['공통 개수', '보냄', '수락', '수락률']}
            align={['left', 'right', 'right', 'right']}
            rows={r.byCommonCount.map((b) => [
              `${b.bucket}개`,
              fmtNum(b.sent),
              fmtNum(b.accepted),
              fmtPct(b.sent ? b.accepted / b.sent : null),
            ])}
          />
        </div>
      </Section>

      <Section title="후속 확인 (가드레일)" description="성립 2일 뒤 “대화를 시작하셨나요?”에 대한 답">
        <Tiles>
          <StatTile label="물어봄" value={fmtNum(p.guardrail.asked)} />
          <StatTile label="응답" value={fmtNum(p.guardrail.responded)} hint={fmtPct(p.guardrail.responseRate)} />
          <StatTile label="대화 시작" value={fmtNum(p.guardrail.started)} hint={`응답 중 ${fmtPct(p.guardrail.startedRate)} · 목표 50 %`} />
        </Tiles>
      </Section>

      <Section title="온보딩" description="가입(사용자 행) → Mattermost 인증 → 완료(관심사 저장)">
        <Funnel
          steps={[
            { label: '가입', value: p.onboarding.signedUp },
            { label: 'Mattermost 인증', value: p.onboarding.verified },
            { label: '완료', value: p.onboarding.completed },
          ]}
        />
        <Tiles>
          <StatTile label="온보딩에서 멈춤" value={fmtNum(p.onboarding.stuck)} tone={p.onboarding.stuck > 0 ? 'bad' : 'plain'} />
          <StatTile label="탈퇴" value={fmtNum(p.onboarding.withdrawn)} />
          <StatTile label="인증 코드 발송 / 사용" value={`${fmtNum(p.onboarding.verificationsSent)} / ${fmtNum(p.onboarding.verificationsUsed)}`} />
          <StatTile label="닉네임 선택 비율" value={fmtPct(p.onboarding.nicknameRate)} hint="실명 대신 닉네임" />
        </Tiles>
        <Columns
          data={p.onboarding.byDay.map((d) => ({ label: fmtDay(d.day), title: d.day, values: [d.signedUp, d.completed] }))}
          series={[
            { name: '가입', color: SERIES.primary },
            { name: '완료', color: SERIES.second },
          ]}
          stacked={false}
          tickEvery={tick}
        />
      </Section>

      <Section
        title="관심사"
        description="직접 추가한 관심사가 다른 사람에게 퍼지는가. 만든 사람 외 보유자가 0이면 개인 라벨, 2 이상이면 목록의 빈틈"
      >
        <Tiles>
          <StatTile label="활성" value={fmtNum(p.interests.totalActive)} />
          <StatTile label="직접 추가" value={fmtNum(p.interests.userCreated)} />
          <StatTile label="숨김 / 병합" value={`${fmtNum(p.interests.hidden)} / ${fmtNum(p.interests.merged)}`} />
          <StatTile label={`${data.days}일 변경`} value={`+${fmtNum(p.interests.changes.added)} −${fmtNum(p.interests.changes.removed)}`} hint={`${fmtNum(p.interests.changes.users)}명이 바꿈`} />
          <StatTile label="오늘 추가 상한 도달" value={fmtNum(p.interests.createCapReachedToday)} hint="하루 3개" />
        </Tiles>
        <div>
          <SectionLabel>직접 추가한 관심사</SectionLabel>
          <DataTable
            head={['이름', '분류', '만든 사람', '보유', '그 외', '상태', '만든 때']}
            align={['left', 'left', 'left', 'right', 'right', 'left', 'left']}
            rows={p.interests.created.map((it) => [
              it.name,
              it.category,
              it.creator?.displayName ?? '–',
              fmtNum(it.holderCount),
              fmtNum(it.others),
              <InterestStatus key={it.id} status={it.status} />,
              fmtTime(it.createdAt),
            ])}
          />
        </div>
        {p.interests.createdByCategory.length > 0 && (
          <div>
            <SectionLabel>직접 추가한 관심사의 분류</SectionLabel>
            <HBars items={p.interests.createdByCategory.map((c) => ({ label: c.category, value: c.count }))} />
          </div>
        )}
        <div>
          <SectionLabel>보유자가 많은 관심사</SectionLabel>
          <HBars items={p.interests.topByHolders.map((it) => ({ label: it.name, value: it.holderCount }))} />
        </div>
      </Section>

      <Section
        title="탐색"
        description="열람은 서버가 기록한 것, 클릭은 화면이 보낸 것. 보기만 많고 요청이 없는 길은 구경거리다"
      >
        <Tiles>
          <StatTile label="내 그래프" value={fmtNum(p.exploration.views.graphMe)} />
          <StatTile label="관심사 중심" value={fmtNum(p.exploration.views.graphInterest)} hint={`둘 이상 교집합 ${fmtNum(p.exploration.views.graphMulti)}`} />
          <StatTile label="비슷한 사람" value={fmtNum(p.exploration.views.similar)} />
          <StatTile label="프로필 열람" value={fmtNum(p.exploration.views.profile)} />
          <StatTile label="관심사 상세" value={fmtNum(p.exploration.views.interestDetail)} />
          <StatTile label="관심사 사람 목록" value={fmtNum(p.exploration.views.interestPeople)} />
          <StatTile label="프로필 연 사람 비율" value={fmtPct(p.exploration.profileViewerRate)} hint="완료자 중" />
          <StatTile label="요청 보낸 사람 비율" value={fmtPct(p.exploration.requesterRate)} hint="프로필 연 사람 중 · 목표 30 %" />
        </Tiles>
        <Columns
          data={p.exploration.byDay.map((d) => ({
            label: fmtDay(d.day),
            title: d.day,
            values: [d.graph, d.similar, d.profile],
          }))}
          series={[
            { name: '그래프', color: SERIES.primary },
            { name: '비슷한 사람', color: SERIES.second },
            { name: '프로필', color: SERIES.third },
          ]}
          stacked={false}
          tickEvery={tick}
        />
        <div>
          <SectionLabel>클릭</SectionLabel>
          <Tiles>
            <StatTile label="관심사 노드" value={fmtNum(p.exploration.clicks.interest)} />
            <StatTile label="사람 노드" value={fmtNum(p.exploration.clicks.person)} />
            <StatTile label="앵커 변경" value={fmtNum(p.exploration.clicks.anchorChange)} />
            <StatTile label="배경" value={fmtNum(p.exploration.clicks.background)} />
            <StatTile label="비슷한 사람 끔" value={fmtNum(p.exploration.clicks.similarOff)} />
          </Tiles>
        </div>
        <div>
          <SectionLabel>앵커로 많이 쓴 관심사</SectionLabel>
          <HBars items={p.exploration.topAnchors.map((a) => ({ label: a.name, value: a.count }))} />
        </div>
      </Section>

      <Section
        title="활동 시간"
        description={
          p.activity.trackingSince
            ? `기록 시작 ${fmtTime(p.activity.trackingSince)} (KST). 그 전의 활동은 없다`
            : '아직 기록이 없다'
        }
      >
        <div>
          <SectionLabel>시각별 홈 진입 (KST)</SectionLabel>
          <Columns
            data={p.activity.hourOfDay.map((n, h) => ({ label: `${h}`, title: `${h}시`, values: [n] }))}
            series={[{ name: '그래프 열람', color: SERIES.primary }]}
            height={90}
            tickEvery={3}
          />
        </div>
        <div>
          <SectionLabel>요일별</SectionLabel>
          <Columns
            data={p.activity.weekday.map((n, i) => ({ label: WEEKDAY[i] ?? String(i), values: [n] }))}
            series={[{ name: '그래프 열람', color: SERIES.primary }]}
            height={70}
          />
        </div>
        <div>
          <SectionLabel>일별 활동 사용자 (DAU)</SectionLabel>
          <Columns
            data={p.activity.dau.map((d) => ({ label: fmtDay(d.day), title: d.day, values: [d.count] }))}
            series={[{ name: '사용자', color: SERIES.primary }]}
            tickEvery={tick}
          />
        </div>
      </Section>

      <Section title="알림" description="Mattermost 로 나간 알림이 읽히는가의 유일한 신호가 클릭이다">
        <Tiles>
          <StatTile label="묶음 알림 발송" value={fmtNum(p.notifications.digest.sent)} />
          <StatTile label="묶음 알림 클릭" value={fmtNum(p.notifications.digest.clicked)} hint={fmtPct(p.notifications.digest.clickRate)} />
        </Tiles>
        <DataTable
          head={['종류', '발송', '클릭', '클릭률']}
          align={['left', 'right', 'right', 'right']}
          rows={p.notifications.byType.map((t) => [
            <code key={t.type} className="text-[12px]">{t.type}</code>,
            fmtNum(t.sent),
            fmtNum(t.clicked),
            fmtPct(t.clickRate),
          ])}
        />
      </Section>

      <Section
        title="Network 추천"
        description={p.network.enabled ? '기능 켜짐 — 후보가 노출되고 알림이 나간다' : '기능 꺼짐 — 후보만 계산한다(D-75)'}
      >
        <Tiles>
          <StatTile label="상태" value={p.network.enabled ? '켜짐' : '꺼짐'} />
          <StatTile label="후보" value={fmtNum(p.network.candidates)} />
          <StatTile label="열림" value={fmtNum(p.network.open)} />
          <StatTile label="성립" value={fmtNum(p.network.activated)} />
          <StatTile label="만료 / 해산" value={`${fmtNum(p.network.expired)} / ${fmtNum(p.network.dissolved)}`} />
          <StatTile label="참여 / 거절" value={`${fmtNum(p.network.joined)} / ${fmtNum(p.network.declined)}`} />
        </Tiles>
      </Section>
    </div>
  );
}

function InterestStatus({ status }: { status: 'ACTIVE' | 'HIDDEN' | 'MERGED' }) {
  if (status === 'ACTIVE') return <Badge variant="outline">활성</Badge>;
  if (status === 'HIDDEN') return <Badge variant="secondary">숨김</Badge>;
  return <Badge variant="secondary">병합됨</Badge>;
}

// ─────────────────────────────────────────────────────────
// 서버
// ─────────────────────────────────────────────────────────

function ServerTab({ data }: { data: OpsMetrics }) {
  const s = data.server;
  const tick = data.days > 14 ? 4 : data.days > 7 ? 2 : 1;
  const staleJobs = s.jobs.filter((j) => j.stale).length;
  const memUsed = s.host.totalMemMb - s.host.freeMemMb;

  return (
    <div className="flex flex-col gap-3">
      <Tiles>
        <StatTile label="가동" value={fmtUptime(s.process.uptimeSec)} hint={`시작 ${fmtTime(s.process.startedAt)}`} />
        <StatTile label="HTTP 5xx" value={fmtNum(s.http.status5xx)} hint={`시작 뒤 누적 · 요청 ${fmtNum(s.http.total)}`} tone={s.http.status5xx > 0 ? 'bad' : 'plain'} />
        <StatTile label="발송 못 한 알림" value={fmtNum(s.deliveries.stuckQueued)} hint="30분 넘게 대기" tone={s.deliveries.stuckQueued > 0 ? 'bad' : 'plain'} />
        <StatTile label="늦은 배치" value={fmtNum(staleJobs)} hint={`잡 ${fmtNum(s.jobs.length)}개 중`} tone={staleJobs > 0 ? 'bad' : 'plain'} />
        <StatTile label="웹훅 실패" value={fmtNum(s.webhook.failed)} hint={`성공 ${fmtNum(s.webhook.ok)}`} tone={s.webhook.failed > 0 ? 'bad' : 'plain'} />
        <StatTile label="DB 크기" value={fmtMb(s.db.sizeMb)} hint={`연결 ${fmtNum(s.db.connections)} · 이벤트 ${fmtNum(s.db.events)}`} />
        <StatTile
          label="마지막 백업"
          value={s.backups.last ? fmtTime(s.backups.last.at) : s.backups.available ? '없음' : '폴더 없음'}
          hint={s.backups.last ? `${fmtMb(s.backups.last.sizeMb)} · ${fmtNum(s.backups.count)}개` : '백업 폴더가 마운트돼야 보인다'}
          tone={s.backups.available && !s.backups.last ? 'bad' : 'plain'}
        />
        <StatTile label="디스크 여유" value={fmtMb(s.backups.diskFreeMb)} hint={s.backups.diskTotalMb ? `전체 ${fmtMb(s.backups.diskTotalMb)}` : undefined} />
      </Tiles>

      <Section title="프로세스와 호스트">
        <Tiles>
          <StatTile label="Node" value={s.process.nodeVersion} />
          <StatTile label="RSS" value={fmtMb(s.process.rssMb)} hint={`힙 ${fmtMb(s.process.heapUsedMb)}`} />
          <StatTile label="호스트 메모리" value={`${fmtMb(memUsed)} / ${fmtMb(s.host.totalMemMb)}`} hint={`여유 ${fmtMb(s.host.freeMemMb)}`} />
          <StatTile label="부하 (1·5·15분)" value={s.host.loadAvg.map((n) => n.toFixed(2)).join(' · ')} hint={`CPU ${s.host.cpus}개`} />
          <StatTile label="NODE_ENV" value={s.mode.nodeEnv} />
          <StatTile
            label="Mattermost 발송 모드"
            value={s.mode.deliveryMode}
            hint={s.mode.allowListSize > 0 ? `허용 목록 ${fmtNum(s.mode.allowListSize)}명` : '허용 목록 없음'}
            tone={s.mode.deliveryMode === 'live' ? 'good' : 'plain'}
          />
        </Tiles>
      </Section>

      <Section title="HTTP" description={`프로세스 시작(${fmtTime(s.http.since)}) 뒤 메모리 안에서 센 것. 재시작하면 0부터`}>
        <Tiles>
          <StatTile label="요청" value={fmtNum(s.http.total)} />
          <StatTile label="4xx" value={fmtNum(s.http.status4xx)} />
          <StatTile label="5xx" value={fmtNum(s.http.status5xx)} tone={s.http.status5xx > 0 ? 'bad' : 'plain'} />
          <StatTile label="1초 넘김" value={fmtNum(s.http.slow)} />
          <StatTile label="평균 / p95" value={`${fmtMs(s.http.avgMs)} / ${fmtMs(s.http.p95Ms)}`} />
          <StatTile label="초대 코드 404" value={fmtNum(s.http.invite404)} hint="폭주하면 무작위 대입" tone={s.http.invite404 > 20 ? 'bad' : 'plain'} />
          <StatTile label="401" value={fmtNum(s.http.unauthenticated)} />
        </Tiles>
        <div>
          <SectionLabel>최근 24시간, 시각별</SectionLabel>
          <Columns
            data={s.http.hourly.map((h) => ({
              // 서버가 주는 시각 통은 UTC ISO 다. KST 시각으로 보여준다.
              label: kstHour(h.hour),
              title: `${kstHour(h.hour)}시 (KST)`,
              values: [h.total - h.status5xx, h.status5xx],
            }))}
            series={[
              { name: '요청', color: SERIES.primary },
              { name: '5xx', color: SERIES.bad },
            ]}
            height={90}
            tickEvery={3}
          />
          {s.http.hourly.some((h) => h.slow > 0) && (
            <Muted className="mt-1 text-[12px]">
              1초 넘긴 요청: {s.http.hourly.filter((h) => h.slow > 0).map((h) => `${kstHour(h.hour)}시 ${h.slow}`).join(', ')}
            </Muted>
          )}
        </div>
        <div>
          <SectionLabel>최근 오류 (5xx)</SectionLabel>
          <DataTable
            head={['시각', '메서드', '경로', '상태', '걸린 시간']}
            align={['left', 'left', 'left', 'right', 'right']}
            rows={s.http.recentErrors.map((e, i) => [
              fmtTime(e.at),
              e.method,
              <code key={i} className="text-[12px] break-all">{e.path}</code>,
              String(e.status),
              fmtMs(e.ms),
            ])}
            empty="오류 없음"
          />
        </div>
      </Section>

      <Section title="Mattermost 웹훅" description={`프로세스 시작(${fmtTime(s.webhook.since)}) 뒤. 400 은 없는 아이디, 그 밖은 Mattermost 쪽 문제(design/23 §6)`}>
        <Tiles>
          <StatTile label="성공" value={fmtNum(s.webhook.ok)} />
          <StatTile label="실패" value={fmtNum(s.webhook.failed)} tone={s.webhook.failed > 0 ? 'bad' : 'plain'} />
          <StatTile label="평균 / p95" value={`${fmtMs(s.webhook.avgMs)} / ${fmtMs(s.webhook.p95Ms)}`} />
        </Tiles>
        {s.webhook.byError.length > 0 && (
          <div>
            <SectionLabel>실패 원인</SectionLabel>
            <HBars items={s.webhook.byError.map((e) => ({ label: e.error, value: e.count }))} color={SERIES.bad} />
          </div>
        )}
        <div>
          <SectionLabel>최근 호출</SectionLabel>
          <DataTable
            head={['시각', '결과', '오류', '걸린 시간']}
            align={['left', 'left', 'left', 'right']}
            rows={s.webhook.recent.map((w, i) => [
              fmtTime(w.at),
              w.ok ? <Badge key={i} variant="outline">성공</Badge> : <Badge key={i} variant="destructive">실패</Badge>,
              w.error ?? '–',
              fmtMs(w.ms),
            ])}
            empty="호출 없음"
          />
        </div>
      </Section>

      <Section title="알림 발송" description="Mattermost 채널 기준. 재시도가 없으니 실패 수가 곧 못 받은 사람 수다">
        <Tiles>
          <StatTile label="24시간 대기" value={fmtNum(s.deliveries.last24h.queued)} />
          <StatTile label="24시간 발송" value={fmtNum(s.deliveries.last24h.sent)} />
          <StatTile label="24시간 실패" value={fmtNum(s.deliveries.last24h.failed)} tone={s.deliveries.last24h.failed > 0 ? 'bad' : 'plain'} />
          <StatTile label="24시간 건너뜀" value={fmtNum(s.deliveries.last24h.skipped)} hint="Mattermost 아이디 없음" />
          <StatTile label="30분 넘게 대기" value={fmtNum(s.deliveries.stuckQueued)} tone={s.deliveries.stuckQueued > 0 ? 'bad' : 'plain'} />
        </Tiles>
        <Columns
          data={s.deliveries.byDay.map((d) => ({ label: fmtDay(d.day), title: d.day, values: [d.sent, d.failed] }))}
          series={[
            { name: '발송', color: SERIES.primary },
            { name: '실패', color: SERIES.bad },
          ]}
          tickEvery={tick}
        />
        <div>
          <SectionLabel>최근 실패</SectionLabel>
          <DataTable
            head={['시각', '종류', '오류']}
            rows={s.deliveries.recentFailures.map((f, i) => [
              fmtTime(f.at),
              <code key={i} className="text-[12px]">{f.type}</code>,
              f.error ?? '–',
            ])}
            empty="실패 없음"
          />
        </div>
      </Section>

      <Section title="배치" description="프로세스 안의 cron. 재시작 사이의 잡은 건너뛴다. 주기보다 오래 성공이 없으면 빨간 표시">
        <DataTable
          head={['잡', '주기', '상태', '마지막 성공 뒤', '마지막 시작', '걸린 시간', '오류']}
          align={['left', 'left', 'left', 'right', 'left', 'right', 'left']}
          rows={s.jobs.map((j) => [
            <code key={j.name} className="text-[12px]">{j.name}</code>,
            j.schedule,
            <JobStatus key={`${j.name}-s`} job={j} />,
            fmtHours(j.hoursSinceSuccess),
            fmtTime(j.lastStartedAt),
            fmtMs(j.lastDurationMs),
            j.lastError ? <span className="text-destructive break-all">{j.lastError}</span> : '–',
          ])}
        />
      </Section>

      <Section title="DB" description="추정 행 수(pg_stat). 큰 표부터">
        <DataTable
          head={['표', '행', '크기']}
          align={['left', 'right', 'right']}
          rows={s.db.tables.map((t) => [
            <code key={t.name} className="text-[12px]">{t.name}</code>,
            fmtNum(t.rows),
            fmtMb(t.sizeMb),
          ])}
        />
      </Section>

      <Section title="남용 신호">
        <Tiles>
          <StatTile label="정지된 사용자" value={fmtNum(s.abuse.suspended)} />
          <StatTile label="오늘 요청 상한 도달" value={fmtNum(s.abuse.capReachedToday)} tone={s.abuse.capReachedToday > 0 ? 'bad' : 'plain'} />
          <StatTile label="수락률 감속 발동" value={fmtNum(s.abuse.decelerated)} hint="스팸 신호" />
        </Tiles>
        {s.backups.available === false && (
          <Empty>백업 폴더가 컨테이너에 마운트되지 않았다. deploy/docker-compose.prod.yml 의 api volumes 를 본다.</Empty>
        )}
      </Section>
    </div>
  );
}

function JobStatus({ job }: { job: OpsJob }) {
  if (job.stale) return <Badge variant="destructive">늦음</Badge>;
  if (job.lastStatus === 'failed') return <Badge variant="destructive">실패</Badge>;
  if (job.lastStatus === 'running') return <Badge variant="secondary">실행 중</Badge>;
  if (job.lastStatus === 'done') return <Badge variant="outline">정상</Badge>;
  return <Badge variant="secondary">기록 없음</Badge>;
}

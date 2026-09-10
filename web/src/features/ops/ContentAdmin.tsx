import type {
  AdminCategory,
  AdminInterestQuestionSummary,
  AdminQuestion,
} from '@ssafy-net/shared';
import { CATEGORY_NAME_MAX, QUESTION_TEXT_MAX } from '@ssafy-net/shared';
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '../../api/client';
import { Muted } from '../../components/primitives';
import { useSession } from '../../session';
import { Section } from './charts';

/**
 * 운영자 레버 — 내용 관리 (D-84 · D-86 · D-87).
 *   InviteSwitch       가입에 초대 링크가 필요한지
 *   CategoriesSection  관심사 분류(대분류) 추가·이름·순서·삭제
 *   QuestionsSection   네트워킹 질문: 주제별 고정 질문과 포괄 아이스브레이킹
 * 서버가 준 것을 그대로 보여주고, 바꾼 뒤에는 목록을 다시 받는다. 여기서 계산하지 않는다.
 */

const errorText = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

// ─────────────────────────────────────────────────────────
// 초대 링크 (D-84)
// ─────────────────────────────────────────────────────────

export function InviteSwitch() {
  const { features, reloadFeatures } = useSession();
  const [busy, setBusy] = useState(false);
  const required = features?.invite_required ?? false;

  const apply = async (next: boolean) => {
    setBusy(true);
    try {
      await api.put('/admin/ops/invite', { required: next });
      await reloadFeatures();
      toast.success(next ? '이제 초대 링크를 연 사람만 가입합니다' : '이제 누구나 Google 로 바로 가입합니다');
    } catch (cause) {
      toast.error(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="가입"
      description="SSAFY 만 대상이라 초대 링크는 기본으로 필요 없다. 온보딩의 Mattermost 인증이 소속 검증이다(D-66). 켜면 옛 규칙대로 초대 링크를 연 사람만 가입한다"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={required ? 'default' : 'secondary'}>
          {required ? '초대 링크 필요' : '초대 링크 없이 가입'}
        </Badge>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !features}
          onClick={() => void apply(!required)}
        >
          {required ? '초대 링크 없이 가입되게' : '초대 링크를 요구하게'}
        </Button>
        <Muted className="text-[12.5px]">이미 가입한 사람에게는 영향이 없습니다. 초대 코드는 시드가 출력한 것을 그대로 씁니다.</Muted>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────
// 관심사 분류 (D-86)
// ─────────────────────────────────────────────────────────

export function CategoriesSection() {
  const [items, setItems] = useState<AdminCategory[] | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'INTEREST' | 'ATTRIBUTE'>('INTEREST');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.get<AdminCategory[]>('/admin/categories'));
    } catch (cause) {
      toast.error(errorText(cause));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (work: () => Promise<void>, done?: string) => {
    setBusy(true);
    try {
      await work();
      if (done) toast.success(done);
      await load();
    } catch (cause) {
      toast.error(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const add = (event: FormEvent) => {
    event.preventDefault();
    const value = name.trim();
    if (!value) return;
    void run(async () => {
      await api.post('/admin/categories', { name: value, kind });
      setName('');
    }, `"${value}" 분류를 추가했습니다`);
  };

  const rename = () => {
    if (!editing) return;
    const value = editing.name.trim();
    const id = editing.id;
    void run(async () => {
      await api.patch(`/admin/categories/${id}`, { name: value });
      setEditing(null);
    }, '이름을 바꿨습니다');
  };

  const move = (item: AdminCategory, delta: -1 | 1) => {
    if (!items) return;
    const index = items.findIndex((row) => row.id === item.id);
    const to = index + delta;
    if (to < 0 || to >= items.length) return;
    void run(() => api.patch(`/admin/categories/${item.id}`, { sortOrder: to }).then(() => undefined));
  };

  const remove = (item: AdminCategory) => {
    void run(async () => {
      await api.del<void>(`/admin/categories/${item.id}`);
      setRemoving(null);
    }, `"${item.name}" 분류를 지웠습니다`);
  };

  return (
    <Section
      title="관심사 분류"
      description="관심사 목록의 묶음이자 그래프의 색. 이름과 순서를 바꾸고, 비어 있는 분류만 지운다. 속성(ATTRIBUTE)은 층처럼 분류당 하나만 고르는 것이다(D-72). 종류는 만든 뒤 바꿀 수 없다"
    >
      {!items ? (
        <Skeleton className="h-[120px]" />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2"
            >
              {editing?.id === item.id ? (
                <form
                  className="flex flex-1 flex-wrap items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    rename();
                  }}
                >
                  <Input
                    value={editing.name}
                    maxLength={CATEGORY_NAME_MAX}
                    autoFocus
                    onChange={(event) => setEditing({ id: item.id, name: event.target.value })}
                    className="h-8 max-w-[220px]"
                  />
                  <Button type="submit" size="sm" disabled={busy || !editing.name.trim()}>
                    저장
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(null)}>
                    취소
                  </Button>
                </form>
              ) : (
                <>
                  <span className="font-medium">{item.name}</span>
                  <Badge variant={item.kind === 'ATTRIBUTE' ? 'outline' : 'secondary'}>
                    {item.kind === 'ATTRIBUTE' ? '속성' : '이야깃거리'}
                  </Badge>
                  <Muted className="text-[12.5px]">관심사 {item.interestCount}개</Muted>
                </>
              )}
              <div className="ml-auto flex items-center gap-1">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="위로"
                  disabled={busy || index === 0}
                  onClick={() => move(item, -1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="아래로"
                  disabled={busy || index === items.length - 1}
                  onClick={() => move(item, 1)}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="이름 바꾸기"
                  disabled={busy}
                  onClick={() => setEditing({ id: item.id, name: item.name })}
                >
                  <PencilIcon />
                </Button>
                {removing === item.id ? (
                  <>
                    <span className="text-[12.5px]">지울까요?</span>
                    <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => remove(item)}>
                      삭제
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setRemoving(null)}>
                      취소
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="삭제"
                    // 비어 있을 때만 지울 수 있다. 관심사와 사람들의 선택이 같이 사라지기 때문이다.
                    disabled={busy || item.interestCount > 0}
                    title={item.interestCount > 0 ? '관심사가 있는 분류는 지울 수 없습니다' : undefined}
                    onClick={() => setRemoving(item.id)}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="flex flex-wrap items-center gap-2" onSubmit={add}>
        <Input
          value={name}
          maxLength={CATEGORY_NAME_MAX}
          onChange={(event) => setName(event.target.value)}
          placeholder="새 분류 이름"
          className="max-w-[240px]"
          required
        />
        <Select value={kind} onValueChange={(value) => setKind(value as 'INTEREST' | 'ATTRIBUTE')}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="INTEREST">이야깃거리</SelectItem>
            <SelectItem value="ATTRIBUTE">속성</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>
          분류 추가
        </Button>
      </form>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────
// 네트워킹 질문 (D-87)
// ─────────────────────────────────────────────────────────

/** 질문 목록 하나. 주제별과 포괄이 같은 편집기를 쓴다 — 다른 것은 경로와 `active` 뿐이다. */
function QuestionList({
  items,
  busy,
  withActive,
  onCreate,
  onUpdate,
  onDelete,
}: {
  items: AdminQuestion[] | null;
  busy: boolean;
  withActive?: boolean;
  onCreate: (text: string) => Promise<void>;
  onUpdate: (id: string, patch: { text?: string; sortOrder?: number; active?: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  if (!items) return <Skeleton className="h-[120px]" />;

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 ? (
        <Muted className="text-[12.5px]">아직 질문이 없습니다.</Muted>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {items.map((item, index) => (
            <li
              key={item.id}
              className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-3 py-1.5 text-[13.5px] ${
                item.active === false ? 'opacity-55' : ''
              }`}
            >
              <span className="w-5 text-right text-[12px] text-muted-foreground">{index + 1}.</span>
              {editing?.id === item.id ? (
                <form
                  className="flex flex-1 flex-wrap items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const text = editing.text.trim();
                    if (!text) return;
                    void onUpdate(item.id, { text }).then(() => setEditing(null));
                  }}
                >
                  <Input
                    value={editing.text}
                    maxLength={QUESTION_TEXT_MAX}
                    autoFocus
                    onChange={(event) => setEditing({ id: item.id, text: event.target.value })}
                    className="h-8 flex-1"
                  />
                  <Button type="submit" size="sm" disabled={busy || !editing.text.trim()}>
                    저장
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(null)}>
                    취소
                  </Button>
                </form>
              ) : (
                <span className="flex-1">{item.text}</span>
              )}
              {withActive && item.active === false && <Badge variant="outline">꺼짐</Badge>}
              <div className="ml-auto flex items-center gap-0.5">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="위로"
                  disabled={busy || index === 0}
                  onClick={() => void onUpdate(item.id, { sortOrder: items[index - 1].sortOrder })}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="아래로"
                  disabled={busy || index === items.length - 1}
                  onClick={() => void onUpdate(item.id, { sortOrder: items[index + 1].sortOrder + 1 })}
                >
                  <ArrowDownIcon />
                </Button>
                {withActive && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void onUpdate(item.id, { active: item.active === false })}
                  >
                    {item.active === false ? '켜기' : '끄기'}
                  </Button>
                )}
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="수정"
                  disabled={busy}
                  onClick={() => setEditing({ id: item.id, text: item.text })}
                >
                  <PencilIcon />
                </Button>
                {removing === item.id ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void onDelete(item.id).then(() => setRemoving(null))}
                    >
                      삭제
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setRemoving(null)}>
                      취소
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="삭제"
                    disabled={busy}
                    onClick={() => setRemoving(item.id)}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const text = draft.trim();
          if (!text) return;
          void onCreate(text).then(() => setDraft(''));
        }}
      >
        <Input
          value={draft}
          maxLength={QUESTION_TEXT_MAX}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="새 질문"
          className="min-w-[240px] flex-1"
        />
        <Button type="submit" size="sm" disabled={busy || !draft.trim()}>
          질문 추가
        </Button>
      </form>
    </div>
  );
}

export function QuestionsSection() {
  const [summaries, setSummaries] = useState<AdminInterestQuestionSummary[] | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [interestQuestions, setInterestQuestions] = useState<AdminQuestion[] | null>(null);
  const [icebreakers, setIcebreakers] = useState<AdminQuestion[] | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSummaries = useCallback(async () => {
    try {
      setSummaries(await api.get<AdminInterestQuestionSummary[]>('/admin/questions/interests'));
    } catch (cause) {
      toast.error(errorText(cause));
    }
  }, []);

  const loadIcebreakers = useCallback(async () => {
    try {
      setIcebreakers(await api.get<AdminQuestion[]>('/admin/questions/icebreakers'));
    } catch (cause) {
      toast.error(errorText(cause));
    }
  }, []);

  const loadInterest = useCallback(async (interestId: string) => {
    if (!interestId) {
      setInterestQuestions(null);
      return;
    }
    try {
      setInterestQuestions(await api.get<AdminQuestion[]>(`/admin/questions/interests/${interestId}`));
    } catch (cause) {
      toast.error(errorText(cause));
    }
  }, []);

  useEffect(() => {
    void loadSummaries();
    void loadIcebreakers();
  }, [loadSummaries, loadIcebreakers]);

  useEffect(() => {
    void loadInterest(selected);
  }, [selected, loadInterest]);

  const run = async (work: () => Promise<void>, after: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
      await after();
    } catch (cause) {
      toast.error(errorText(cause));
      throw cause;
    } finally {
      setBusy(false);
    }
  };

  const afterInterest = async () => {
    await Promise.all([loadInterest(selected), loadSummaries()]);
  };

  /** 분류별로 묶어 고르기 쉽게. 질문 수가 0인 것은 이름 옆에 표시한다. */
  const grouped = useMemo(() => {
    const map = new Map<string, AdminInterestQuestionSummary[]>();
    for (const row of summaries ?? []) {
      const list = map.get(row.categoryName) ?? [];
      list.push(row);
      map.set(row.categoryName, list);
    }
    return [...map.entries()];
  }, [summaries]);

  const current = summaries?.find((row) => row.interestId === selected) ?? null;
  const emptyCount = summaries?.filter((row) => row.questionCount === 0).length ?? 0;

  return (
    <>
      <Section
        title="주제별 질문"
        description="관심사마다 고정된 질문. 네트워크가 성립하면 그 네트워크가 공유하는 관심사의 질문이 성립 화면과 성립 알림에 붙는다. 시드는 틀 문장 3개를 넣어 두었을 뿐이니 여기서 진짜 질문으로 바꾼다"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="관심사를 고르세요" />
            </SelectTrigger>
            <SelectContent>
              {grouped.map(([category, rows]) => (
                <div key={category}>
                  <div className="px-2 pt-2 pb-1 text-[11px] font-bold tracking-wider text-muted-foreground">
                    {category}
                  </div>
                  {rows.map((row) => (
                    <SelectItem key={row.interestId} value={row.interestId}>
                      {row.interestName}
                      <span className="ml-1 text-muted-foreground">
                        · 질문 {row.questionCount} · {row.holderCount}명
                      </span>
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
          {summaries && (
            <Muted className="text-[12.5px]">
              관심사 {summaries.length}개{emptyCount > 0 && ` · 질문 없는 것 ${emptyCount}개`}
            </Muted>
          )}
        </div>
        {current ? (
          <QuestionList
            items={interestQuestions}
            busy={busy}
            onCreate={(text) =>
              run(() => api.post(`/admin/questions/interests/${current.interestId}`, { text }), afterInterest)
            }
            onUpdate={(id, patch) =>
              run(() => api.patch(`/admin/questions/interest-questions/${id}`, patch), afterInterest)
            }
            onDelete={(id) =>
              run(() => api.del<void>(`/admin/questions/interest-questions/${id}`), afterInterest)
            }
          />
        ) : (
          <Muted className="text-[12.5px]">관심사를 고르면 그 관심사의 질문이 보입니다.</Muted>
        )}
      </Section>

      <Section
        title="포괄 아이스브레이킹 질문"
        description="주제와 무관한 가벼운 질문. 네트워크가 성립할 때 켜진 것 중 2개를 무작위로 뽑아 그 네트워크에 고정한다. 잠시 빼려면 지우지 말고 끈다 — 지우면 이미 성립한 네트워크에서도 사라진다"
      >
        {icebreakers && (
          <Muted className="text-[12.5px]">
            전체 {icebreakers.length}개 · 켜짐 {icebreakers.filter((q) => q.active !== false).length}개
          </Muted>
        )}
        <QuestionList
          items={icebreakers}
          busy={busy}
          withActive
          onCreate={(text) => run(() => api.post('/admin/questions/icebreakers', { text }), loadIcebreakers)}
          onUpdate={(id, patch) =>
            run(() => api.patch(`/admin/questions/icebreakers/${id}`, patch), loadIcebreakers)
          }
          onDelete={(id) => run(() => api.del<void>(`/admin/questions/icebreakers/${id}`), loadIcebreakers)}
        />
      </Section>
    </>
  );
}

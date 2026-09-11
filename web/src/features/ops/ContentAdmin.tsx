import type {
  AdminCategory,
  AdminInterest,
  AdminInterestQuestionSummary,
  AdminQuestion,
} from '@ssafy-net/shared';
import { CATEGORY_NAME_MAX, INTEREST_NAME_MAX, QUESTION_TEXT_MAX } from '@ssafy-net/shared';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EyeIcon,
  EyeOffIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api } from '../../api/client';
import { Muted, Notice } from '../../components/primitives';
import {
  OverlayActions,
  OverlaySection,
  ResponsiveDialog,
} from '../../components/ResponsiveDialog';
import { useSession } from '../../session';
import { Section } from './charts';

/**
 * 운영자 레버 — 내용 관리 (D-84 · D-86 · D-87 · D-88).
 *   InviteSwitch       가입에 초대 링크가 필요한지
 *   CategoriesSection  관심사 분류(대분류) 추가·이름·순서·삭제
 *   InterestsSection   관심사 추가·이름·별칭·분류·순서·숨김·삭제
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
// 주말 알림 (D-95)
// ─────────────────────────────────────────────────────────

/**
 * 토·일에 메신저 DM 을 보내지 않는 스위치. 기본은 켜짐.
 *
 * 끄는 것은 DM 뿐이다 — 앱 알림함은 주말에도 쌓이고, 미뤄 둔 DM 은 월요일 09:00 에
 * 사람마다 한 통으로 요약해 나간다. 운영자 공지는 주말에도 바로 간다.
 */
export function WeekendQuietSwitch() {
  const { features, reloadFeatures } = useSession();
  const [busy, setBusy] = useState(false);
  const quiet = features?.weekend_quiet ?? true;

  const apply = async (next: boolean) => {
    setBusy(true);
    try {
      await api.put('/admin/ops/weekend-quiet', { quiet: next });
      await reloadFeatures();
      toast.success(
        next ? '주말에는 메신저 알림을 보내지 않습니다' : '주말에도 평소대로 메신저 알림이 나갑니다',
      );
    } catch (cause) {
      toast.error(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="주말 알림"
      description="토·일(KST)에는 메신저 DM 을 보내지 않고 월요일 09:00 에 사람마다 한 통으로 요약해 보낸다. 앱 알림함은 주말에도 그대로 쌓인다"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={quiet ? 'default' : 'secondary'}>
          {quiet ? '주말 DM 안 보냄' : '주말에도 DM 보냄'}
        </Badge>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !features}
          onClick={() => void apply(!quiet)}
        >
          {quiet ? '주말에도 보내게' : '주말에는 미루게'}
        </Button>
        <Muted className="text-[12.5px]">
          운영자 공지는 주말에도 바로 나갑니다. 끄면 그 자리부터 평소대로 나가고, 이미 미뤄 둔 것은 월요일 요약이 가져갑니다.
        </Muted>
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
// 관심사 (D-88)
// ─────────────────────────────────────────────────────────

/** 분류 필터의 "전체". shadcn Select 는 빈 문자열을 값으로 쓸 수 없다. */
const ALL_CATEGORIES = '__all__';

/** 이름과 별칭 어디에 걸려도 찾는다. 대소문자는 보지 않는다. */
function matchesTerm(item: AdminInterest, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return (
    item.name.toLowerCase().includes(needle) ||
    item.aliases.some((alias) => alias.toLowerCase().includes(needle))
  );
}

/**
 * 관심사 수정 — 줄 안에서 고치기에는 칸이 좁아 대화상자로 연다.
 * 별칭은 쉼표 한 줄이 아니라 **한 줄에 하나**다. 열 개까지 들어가는데 한 줄로는 읽히지 않는다.
 */
function InterestEditDialog({
  item,
  categories,
  busy,
  onSave,
  onClose,
}: {
  item: AdminInterest;
  categories: AdminCategory[];
  busy: boolean;
  onSave: (patch: { name: string; categoryId: string; aliases: string[] }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [aliases, setAliases] = useState(item.aliases.join('\n'));

  const category = categories.find((row) => row.id === categoryId);
  const kindChanges = category && category.kind !== item.categoryKind;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      categoryId,
      aliases: aliases
        .split('\n')
        .map((alias) => alias.trim())
        .filter(Boolean),
    });
  };

  return (
    <ResponsiveDialog
      title="관심사 수정"
      description={
        item.holderCount > 0
          ? `${item.holderCount}명이 고르고 있습니다. 이름을 바꾸면 그 사람들의 그래프에도 새 이름이 보입니다`
          : '아직 아무도 고르지 않았습니다'
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <OverlaySection>
          <Label htmlFor="interest-name" className="mb-1.5">
            이름
          </Label>
          <Input
            id="interest-name"
            value={name}
            maxLength={INTEREST_NAME_MAX}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            className="h-11 text-base"
          />
          <Muted className="mt-1 text-[12px]">
            {name.trim().length} / {INTEREST_NAME_MAX}자
          </Muted>
        </OverlaySection>

        <OverlaySection>
          <Label className="mb-1.5">분류</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                  <span className="ml-1 text-muted-foreground">
                    {row.kind === 'ATTRIBUTE' ? '· 속성' : '· 이야깃거리'}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* 종류가 달라지는 이동은 서버가 막는다. 누르기 전에 알려 준다 */}
          {kindChanges && item.holderCount > 0 && (
            <Notice className="mt-2">
              종류가 다른 분류입니다. 고른 사람이 {item.holderCount}명 있어 이 이동은 저장되지 않습니다.
            </Notice>
          )}
        </OverlaySection>

        <OverlaySection>
          <Label htmlFor="interest-aliases" className="mb-1.5">
            별칭
          </Label>
          <Textarea
            id="interest-aliases"
            value={aliases}
            rows={5}
            onChange={(event) => setAliases(event.target.value)}
            placeholder={'리액트\nreactjs'}
            className="min-h-[124px] text-base"
          />
          <Muted className="mt-1 text-[12px]">
            한 줄에 하나. 검색과 중복 검사가 이 표기도 함께 본다(D-74). 10개까지.
          </Muted>
        </OverlaySection>

        <OverlayActions>
          <Button type="submit" className="flex-1" disabled={busy || !name.trim()}>
            저장
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            취소
          </Button>
        </OverlayActions>
      </form>
    </ResponsiveDialog>
  );
}

/**
 * 관심사 목록 관리 (D-88).
 *
 * 100개가 넘으므로 분류 필터와 검색을 먼저 둔다. 순서 바꾸기는 **같은 분류 안에서만** 뜻이 있어
 * 위·아래 버튼은 그 분류의 이웃과 자리를 바꾼다.
 * 지우기와 숨기기를 나란히 두되, 사람이 있는 관심사에서는 지우기가 잠긴다.
 */
export function InterestsSection() {
  const [items, setItems] = useState<AdminInterest[] | null>(null);
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [filter, setFilter] = useState<string>(ALL_CATEGORIES);
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const load = useCallback(async () => {
    try {
      const [list, cats] = await Promise.all([
        api.get<AdminInterest[]>('/admin/interests'),
        api.get<AdminCategory[]>('/admin/categories'),
      ]);
      setItems(list);
      setCategories(cats);
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

  /** 같은 분류 안에서 몇 번째인지. 위·아래 버튼을 잠그고 옮길 자리를 정하는 데 쓴다 */
  const position = useMemo(() => {
    const map = new Map<string, { index: number; total: number }>();
    const byCategory = new Map<string, AdminInterest[]>();
    for (const item of items ?? []) {
      const list = byCategory.get(item.categoryId) ?? [];
      list.push(item);
      byCategory.set(item.categoryId, list);
    }
    for (const list of byCategory.values()) {
      list.forEach((item, index) => map.set(item.id, { index, total: list.length }));
    }
    return map;
  }, [items]);

  const shown = useMemo(
    () =>
      (items ?? []).filter(
        (item) => (filter === ALL_CATEGORIES || item.categoryId === filter) && matchesTerm(item, term),
      ),
    [items, filter, term],
  );

  const hiddenCount = items?.filter((item) => item.status !== 'ACTIVE').length ?? 0;

  /** 고른 것이 없으면 첫 분류. 목록이 늦게 오거나 고른 분류가 사라져도 비어 있지 않다 */
  const addCategoryId = categoryId || categories?.[0]?.id || '';

  /** 목록을 다시 받아도 같은 관심사를 계속 고치고 있게, id 로 찾는다 */
  const editingItem = editingId ? (items ?? []).find((row) => row.id === editingId) : undefined;

  const add = (event: FormEvent) => {
    event.preventDefault();
    const value = name.trim();
    if (!value || !addCategoryId) return;
    void run(async () => {
      await api.post('/admin/interests', { name: value, categoryId: addCategoryId });
      setName('');
    }, `"${value}" 관심사를 추가했습니다`);
  };

  const save = (id: string, patch: { name: string; categoryId: string; aliases: string[] }) => {
    void run(async () => {
      await api.patch(`/admin/interests/${id}`, patch);
      setEditingId(null);
    }, '관심사를 고쳤습니다');
  };

  const move = (item: AdminInterest, delta: -1 | 1) => {
    const at = position.get(item.id);
    if (!at) return;
    const to = at.index + delta;
    if (to < 0 || to >= at.total) return;
    void run(() => api.patch(`/admin/interests/${item.id}`, { sortOrder: to }).then(() => undefined));
  };

  const toggleHidden = (item: AdminInterest) => {
    const next = item.status === 'ACTIVE' ? 'HIDDEN' : 'ACTIVE';
    void run(
      () => api.patch(`/admin/interests/${item.id}`, { status: next }).then(() => undefined),
      next === 'HIDDEN'
        ? `"${item.name}"을(를) 목록에서 내렸습니다. 이미 가진 사람에게는 남습니다`
        : `"${item.name}"을(를) 다시 목록에 올렸습니다`,
    );
  };

  const remove = (item: AdminInterest) => {
    void run(async () => {
      await api.del<void>(`/admin/interests/${item.id}`);
      setRemoving(null);
    }, `"${item.name}" 관심사를 지웠습니다`);
  };

  return (
    <Section
      // 제품 탭에도 "관심사"(직접 추가·보유자 분석)가 있다. 이름을 나눠 헷갈리지 않게 한다.
      title="관심사 목록"
      description="목록에 무엇이 있는지가 이 서비스의 뼈대다. 이름·별칭·분류·순서를 고치고, 쓰지 않는 것은 숨기고, 아무도 고르지 않은 것만 지운다. 사람이 있는 관심사는 지우지 말고 숨긴다 — 지우면 그 사람들의 선택과 글이 함께 사라진다"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>모든 분류</SelectItem>
            {(categories ?? []).map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="이름·별칭 검색"
          className="max-w-[200px]"
        />
        {items && (
          <Muted className="text-[12.5px]">
            {shown.length === items.length
              ? `전체 ${items.length}개`
              : `${shown.length}개 / 전체 ${items.length}개`}
            {hiddenCount > 0 && ` · 숨김 ${hiddenCount}개`}
          </Muted>
        )}
      </div>

      {!items || !categories ? (
        <Skeleton className="h-[200px]" />
      ) : shown.length === 0 ? (
        <Muted className="text-[12.5px]">해당하는 관심사가 없습니다.</Muted>
      ) : (
        <ul className="flex max-h-[420px] flex-col gap-1.5 overflow-y-auto">
          {shown.map((item) => {
            const at = position.get(item.id);
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2">
                <span
                  className={`font-medium ${item.status === 'ACTIVE' ? '' : 'text-muted-foreground line-through'}`}
                >
                  {item.name}
                </span>
                <Badge variant="secondary">{item.categoryName}</Badge>
                {item.status !== 'ACTIVE' && (
                  <Badge variant="outline">{item.status === 'HIDDEN' ? '숨김' : '병합됨'}</Badge>
                )}
                {item.userAdded && <Badge variant="outline">사용자 추가</Badge>}
                <Muted className="text-[12.5px]">
                  {item.holderCount}명
                  {item.postCount > 0 && ` · 글 ${item.postCount}`}
                  {item.questionCount > 0 && ` · 질문 ${item.questionCount}`}
                  {item.aliases.length > 0 && ` · ${item.aliases.join(', ')}`}
                </Muted>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="위로"
                    disabled={busy || !at || at.index === 0}
                    onClick={() => move(item, -1)}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="아래로"
                    disabled={busy || !at || at.index === at.total - 1}
                    onClick={() => move(item, 1)}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="수정"
                    disabled={busy}
                    onClick={() => setEditingId(item.id)}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={item.status === 'ACTIVE' ? '숨기기' : '보이게'}
                    title={
                      item.status === 'ACTIVE'
                        ? '목록에서 내린다. 이미 가진 사람에게는 남는다'
                        : '다시 목록에 올린다'
                    }
                    // 병합된 것은 여기서 되돌리지 않는다. 합치기 기능이 생기면 그쪽에서 다룬다.
                    disabled={busy || item.status === 'MERGED'}
                    onClick={() => toggleHidden(item)}
                  >
                    {item.status === 'ACTIVE' ? <EyeOffIcon /> : <EyeIcon />}
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
                      // 고른 사람이 있으면 지울 수 없다. 그때는 숨김이 답이다.
                      disabled={busy || item.holderCount > 0}
                      title={
                        item.holderCount > 0
                          ? `${item.holderCount}명이 고르고 있어 지울 수 없습니다. 숨기세요`
                          : item.postCount > 0
                            ? `글 ${item.postCount}개가 함께 사라집니다`
                            : undefined
                      }
                      onClick={() => setRemoving(item.id)}
                    >
                      <Trash2Icon />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form className="flex flex-wrap items-center gap-2" onSubmit={add}>
        <Input
          value={name}
          maxLength={INTEREST_NAME_MAX}
          onChange={(event) => setName(event.target.value)}
          placeholder="새 관심사 이름"
          className="max-w-[200px]"
          required
        />
        <Select value={addCategoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="분류" />
          </SelectTrigger>
          <SelectContent>
            {(categories ?? []).map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={busy || !name.trim() || !addCategoryId}>
          관심사 추가
        </Button>
      </form>

      {editingItem && categories && (
        <InterestEditDialog
          item={editingItem}
          categories={categories}
          busy={busy}
          onSave={(patch) => save(editingItem.id, patch)}
          onClose={() => setEditingId(null)}
        />
      )}
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

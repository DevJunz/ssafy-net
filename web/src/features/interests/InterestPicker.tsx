import type {
  CreatedInterest,
  InterestCatalog,
  InterestListItem,
} from '@ssafy-net/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { api, RequestFailed } from '../../api/client';
import { Chip, Chips, ErrorText, Muted } from '../../components/primitives';
import { SkeletonRows } from '../../components/Skeleton';
import { CreateInterest } from './CreateInterest';

/**
 * 관심사 선택 (docs/06 §3.1.4).
 *
 * 온보딩과 My Profile의 관심사 수정이 같은 화면을 쓴다(D-24).
 * "수정하면 그래프가 바뀐다"는 감각이 유지되어야 하기 때문이다.
 *
 * Category 탭으로 나누지 않는 이유: 100개는 한 목록으로 훑을 수 있는 크기이고,
 * 탭은 "다른 Category에 뭐가 있는지"를 숨긴다.
 *
 * 두 종류의 분류가 있다(D-72).
 *   - INTEREST: 이야깃거리. 최소 [P-01] 최대 [P-02]를 센다
 *   - ATTRIBUTE: 활동하는 층처럼 분류당 하나만 고르는 속성. 개수에 세지 않는다
 *
 * 찾는 관심사가 없으면 여기서 바로 추가한다(D-74). 별도 제안 화면은 없다.
 *
 * 두 가지 모양이 있다.
 *   - page    — 온보딩. 본문 폭(760px)에 한 단으로 늘어놓고 페이지가 스크롤한다
 *   - overlay — My Profile 의 "관심사 수정". 넓은 대화상자를 가득 채우고 분류를
 *               여러 단(1440px 에서 5단)으로 흘려 100개 + 층 20개가 스크롤 없이
 *               한 화면에 들어온다. 좁아지면 단이 줄고 그때는 스크롤한다.
 *               다 보이므로 분류 바로가기 버튼과 선택 요약 줄은 두지 않는다.
 */
export function InterestPicker({
  submitLabel,
  onSaved,
  onCancel,
  variant = 'page',
}: {
  submitLabel: string;
  onSaved: (notice: string | null) => void;
  /** 있으면 취소 버튼이 생긴다(My Profile) */
  onCancel?: () => void;
  /** 넓은 대화상자 안에 들어가는 형태. 부모 높이를 채우고 목록을 여러 단으로 나눈다 */
  variant?: 'page' | 'overlay';
}) {
  const [catalog, setCatalog] = useState<InterestCatalog | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const overlay = variant === 'overlay';

  useEffect(() => {
    api
      .get<InterestCatalog>('/interests')
      .then((data) => {
        setCatalog(data);
        setSelected(
          new Set(
            data.categories.flatMap((category) =>
              category.interests.filter((i) => i.mine).map((i) => i.id),
            ),
          ),
        );
      })
      .catch(() => setError('관심사 목록을 불러오지 못했습니다.'));
  }, []);

  const byId = useMemo(() => {
    const map = new Map<
      string,
      { name: string; holderCount: number; categoryId: string; kind: 'INTEREST' | 'ATTRIBUTE' }
    >();
    catalog?.categories.forEach((category) =>
      category.interests.forEach((interest) =>
        map.set(interest.id, {
          name: interest.name,
          holderCount: interest.holderCount,
          categoryId: category.id,
          kind: category.kind,
        }),
      ),
    );
    return map;
  }, [catalog]);

  if (!catalog) {
    return (
      <div className={cn(overlay && 'p-6')}>
        {error ? <ErrorText>{error}</ErrorText> : <SkeletonRows count={4} />}
      </div>
    );
  }

  const { min, max } = catalog;
  const topics = catalog.categories.filter((category) => category.kind === 'INTEREST');
  const attributes = catalog.categories.filter((category) => category.kind === 'ATTRIBUTE');

  const topicCount = [...selected].filter((id) => byId.get(id)?.kind === 'INTEREST').length;
  const atMax = topicCount >= max;
  const shortBy = Math.max(0, min - topicCount);

  const toggle = (id: string) => {
    const meta = byId.get(id);
    if (!meta) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      if (meta.kind === 'ATTRIBUTE') {
        // 속성은 분류당 하나. 새것을 고르면 같은 분류의 이전 선택이 빠진다.
        for (const other of prev) {
          const otherMeta = byId.get(other);
          if (otherMeta?.kind === 'ATTRIBUTE' && otherMeta.categoryId === meta.categoryId) {
            next.delete(other);
          }
        }
        next.add(id);
        return next;
      }
      if ([...next].filter((x) => byId.get(x)?.kind === 'INTEREST').length < max) {
        next.add(id);
      }
      return next;
    });
  };

  const normalized = query.trim().toLowerCase();
  const matches = (interest: InterestListItem) =>
    interest.name.toLowerCase().includes(normalized) ||
    interest.aliases.some((alias) => alias.toLowerCase().includes(normalized));

  const visibleTopics = topics
    .map((category) => ({
      ...category,
      interests: normalized ? category.interests.filter(matches) : category.interests,
    }))
    .filter((category) => category.interests.length > 0);

  const exactExists =
    normalized.length > 0 &&
    topics.some((category) =>
      category.interests.some((interest) => interest.name.toLowerCase() === normalized),
    );

  const onCreated = (interest: CreatedInterest) => {
    setCatalog((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        categories: prev.categories.map((category) =>
          category.id === interest.categoryId
            ? {
                ...category,
                interests: [
                  ...category.interests,
                  {
                    id: interest.id,
                    name: interest.name,
                    aliases: interest.aliases,
                    holderCount: interest.holderCount,
                    mine: false,
                    status: 'ACTIVE' as const,
                  },
                ],
              }
            : category,
        ),
      };
    });
    // 만든 사람이 곧 첫 보유자다. 고르기만 하고 저장은 사용자가 한다.
    setSelected((prev) => {
      const next = new Set(prev);
      if ([...next].filter((x) => byId.get(x)?.kind === 'INTEREST').length < max) {
        next.add(interest.id);
      }
      return next;
    });
    setCreating(false);
    setQuery('');
  };

  const onPickExisting = (id: string) => {
    if (byId.has(id) && !selected.has(id)) toggle(id);
    setCreating(false);
    setQuery('');
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await api.put<{ notice: string }>('/me/interests', {
        interestIds: [...selected],
      });
      onSaved(result.notice ?? null);
    } catch (e) {
      setError(e instanceof RequestFailed ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const renderChip = (interest: InterestListItem, kind: 'INTEREST' | 'ATTRIBUTE') => {
    const isSelected = selected.has(interest.id);
    return (
      <Chip
        key={interest.id}
        selected={isSelected}
        disabled={kind === 'INTEREST' && !isSelected && atMax}
        onClick={() => toggle(interest.id)}
        // 사람 수는 "여기 고르면 누가 있을지"의 힌트다.
        count={`${interest.holderCount}명`}
        // overlay 는 100개가 한 화면에 들어와야 해서 칩을 한 치수 줄인다.
        className={cn(overlay && 'gap-1 px-2 py-[2px] text-[12px] [&>span]:text-[10.5px]')}
      >
        {interest.name}
      </Chip>
    );
  };

  /** 분류 한 덩어리. overlay 에서는 단 중간에서 잘리지 않는다. */
  const categoryBlock = (
    category: InterestCatalog['categories'][number],
    title: string,
    kind: 'INTEREST' | 'ATTRIBUTE',
    lede?: string,
  ) => (
    <div
      key={category.id}
      ref={(node) => {
        sectionRefs.current[category.id] = node;
      }}
      className={cn(overlay && 'mb-3.5 break-inside-avoid')}
    >
      <div
        className={cn(
          'font-semibold tracking-tight',
          overlay ? 'mb-1.5 text-[13px]' : 'mt-7 mb-2.5',
        )}
      >
        {title}
      </div>
      {lede && (
        <Muted className={cn('mb-1.5', overlay ? 'text-[11.5px]' : 'mb-2 text-[13px]')}>
          {lede}
        </Muted>
      )}
      <Chips className={cn(overlay && 'gap-1')}>
        {category.interests.map((interest) => renderChip(interest, kind))}
      </Chips>
    </div>
  );

  // 안내와 저장 버튼. 온보딩에서는 목록 끝에, 대화상자에서는 상자의 발에 놓인다.
  const footer = (
    <>
      {shortBy > 0 && (
        <Muted>{shortBy}개 더 고르면 추천이 생길 가능성이 높아집니다.</Muted>
      )}
      {atMax && (
        <Muted>최대 {max}개까지 고를 수 있습니다. 정말 중요한 것만 남겨보세요.</Muted>
      )}
      {error && <ErrorText>{error}</ErrorText>}

      <div className="flex gap-2">
        <Button
          type="button"
          size="lg"
          disabled={shortBy > 0 || saving}
          onClick={() => void save()}
        >
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="lg" variant="outline" onClick={onCancel}>
            취소
          </Button>
        )}
      </div>
    </>
  );

  return (
    <div className={cn(overlay && 'flex h-full min-h-0 flex-col')}>
      <div className={cn(overlay && 'min-h-0 flex-1 overflow-y-auto px-6 pb-5')}>
        <div
          className={cn(
            'sticky top-0 z-[2] flex flex-col border-b bg-background',
            overlay ? 'gap-3 py-3' : 'gap-4 py-4',
          )}
        >
          {/* overlay 에서는 검색과 개수가 한 줄에 앉아 목록에 높이를 더 준다. */}
          <div className={cn(overlay && 'flex flex-wrap items-center gap-x-4 gap-y-2')}>
            <Input
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCreating(false);
              }}
              placeholder="관심사 검색 (없으면 추가할 수 있습니다)"
              className={cn('h-11 bg-card', overlay && 'h-10 w-[320px] max-w-full')}
            />
            <Muted className={cn(!overlay && 'mt-4')}>
              {topicCount}개 선택 · 최소 {min} · 최대 {max}
            </Muted>
          </div>

          {/*
           * 선택한 것은 스크롤해도 보이도록 상단에 고정한다.
           * overlay 에서는 목록 전체가 한눈에 있고 고른 것이 그 자리에서 파랗게 보이므로
           * 이 줄이 없다 — 그만큼의 높이를 목록에 준다.
           */}
          {!overlay && selected.size > 0 && (
            <Chips>
              {[...selected].map((id) => (
                <Chip key={id} selected onClick={() => toggle(id)}>
                  {byId.get(id)?.name ?? id} ✕
                </Chip>
              ))}
            </Chips>
          )}

          {/* 분류 바로가기. overlay 는 전부 한눈에 보이므로 필요 없다. */}
          {!overlay && !normalized && (
            <Chips>
              {catalog.categories.map((category) => (
                <Button
                  key={category.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto rounded-full px-3 py-[5px] text-[13.5px] font-normal"
                  onClick={() =>
                    sectionRefs.current[category.id]?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    })
                  }
                >
                  {category.name}
                </Button>
              ))}
            </Chips>
          )}
        </div>

        <div
          className={cn(
            overlay &&
              'columns-1 gap-x-5 pt-3 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5',
          )}
        >
          {visibleTopics.map((category) =>
            categoryBlock(category, category.name, 'INTEREST'),
          )}

          {!normalized &&
            attributes.map((category) =>
              categoryBlock(
                category,
                `활동하는 ${category.name}`,
                'ATTRIBUTE',
                overlay
                  ? `하나만 고를 수 있고, 관심사 개수에는 들어가지 않습니다.`
                  : `선택 사항입니다. 하나만 고를 수 있고, 관심사 개수에는 들어가지 않습니다. 같은 ${category.name}에서 활동하는 사람을 그래프에서 볼 수 있습니다.`,
              ),
            )}
        </div>

        {normalized && !exactExists && !creating && (
          <Card className="mt-4 gap-0 rounded-xl py-[22px]">
            <CardContent className="px-6">
              <Muted className="inline">
                {visibleTopics.length === 0 ? '검색 결과가 없습니다. ' : '찾는 것이 없나요? '}
              </Muted>
              {/* 문장 속에 놓이는 버튼. 링크처럼 보이되 버튼으로 동작한다. */}
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-[15px] underline underline-offset-2"
                onClick={() => setCreating(true)}
              >
                “{query.trim()}” 관심사 추가하기
              </Button>
            </CardContent>
          </Card>
        )}

        {creating && (
          <CreateInterest
            initialName={query.trim()}
            categories={topics}
            onCreated={onCreated}
            onPickExisting={onPickExisting}
            onClose={() => setCreating(false)}
          />
        )}

        {!overlay && <div className="mt-8 flex flex-col gap-4">{footer}</div>}
      </div>

      {overlay && (
        <div className="flex flex-col gap-3 border-t bg-background px-6 py-4">{footer}</div>
      )}
    </div>
  );
}

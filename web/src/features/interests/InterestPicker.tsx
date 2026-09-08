import type {
  CreatedInterest,
  InterestCatalog,
  InterestListItem,
} from '@ssafy-net/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, RequestFailed } from '../../api/client';
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
 */
export function InterestPicker({
  submitLabel,
  onSaved,
}: {
  submitLabel: string;
  onSaved: (notice: string | null) => void;
}) {
  const [catalog, setCatalog] = useState<InterestCatalog | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
    return <p className="muted">{error ?? '불러오는 중…'}</p>;
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
      <button
        key={interest.id}
        type="button"
        className={`chip ${isSelected ? 'selected' : ''}`}
        disabled={kind === 'INTEREST' && !isSelected && atMax}
        onClick={() => toggle(interest.id)}
      >
        {interest.name}
        {/* 사람 수는 "여기 고르면 누가 있을지"의 힌트다. */}
        <span className="count">{interest.holderCount}명</span>
      </button>
    );
  };

  return (
    <div>
      <div className="sticky-bar stack">
        <input
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setCreating(false);
          }}
          placeholder="관심사 검색 (없으면 추가할 수 있습니다)"
        />

        <div className="muted">
          {topicCount}개 선택 · 최소 {min} · 최대 {max}
        </div>

        {/* 선택한 것은 스크롤해도 보이도록 상단에 고정한다. */}
        {selected.size > 0 && (
          <div className="chips">
            {[...selected].map((id) => (
              <button
                key={id}
                type="button"
                className="chip selected"
                onClick={() => toggle(id)}
              >
                {byId.get(id)?.name ?? id} ✕
              </button>
            ))}
          </div>
        )}

        {!normalized && (
          <div className="chips">
            {catalog.categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className="chip"
                onClick={() =>
                  sectionRefs.current[category.id]?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  })
                }
              >
                {category.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {visibleTopics.map((category) => (
        <div
          key={category.id}
          ref={(node) => {
            sectionRefs.current[category.id] = node;
          }}
        >
          <div className="category-title">{category.name}</div>
          <div className="chips">
            {category.interests.map((interest) => renderChip(interest, 'INTEREST'))}
          </div>
        </div>
      ))}

      {normalized && !exactExists && !creating && (
        <div className="card" style={{ marginTop: 16 }}>
          <span className="muted">
            {visibleTopics.length === 0 ? '검색 결과가 없습니다. ' : '찾는 것이 없나요? '}
          </span>
          <button type="button" className="link" onClick={() => setCreating(true)}>
            “{query.trim()}” 관심사 추가하기
          </button>
        </div>
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

      {!normalized &&
        attributes.map((category) => (
          <div
            key={category.id}
            ref={(node) => {
              sectionRefs.current[category.id] = node;
            }}
            style={{ marginTop: 24 }}
          >
            <div className="category-title">활동하는 {category.name}</div>
            <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
              선택 사항입니다. 하나만 고를 수 있고, 관심사 개수에는 들어가지 않습니다.
              같은 {category.name}에서 활동하는 사람을 그래프에서 볼 수 있습니다.
            </p>
            <div className="chips">
              {category.interests.map((interest) => renderChip(interest, 'ATTRIBUTE'))}
            </div>
          </div>
        ))}

      <div className="stack" style={{ marginTop: 32 }}>
        {shortBy > 0 && (
          <p className="muted">
            {shortBy}개 더 고르면 추천이 생길 가능성이 높아집니다.
          </p>
        )}
        {atMax && (
          <p className="muted">
            최대 {max}개까지 고를 수 있습니다. 정말 중요한 것만 남겨보세요.
          </p>
        )}
        {error && <p className="error">{error}</p>}

        <button
          className="primary"
          type="button"
          disabled={shortBy > 0 || saving}
          onClick={() => void save()}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

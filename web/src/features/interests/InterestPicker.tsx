import type { InterestCatalog } from '@ssafy-net/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, RequestFailed } from '../../api/client';

/**
 * 관심사 선택 (docs/06 §3.1.4).
 *
 * 온보딩과 My Profile의 관심사 수정이 같은 화면을 쓴다(D-24).
 * "수정하면 그래프가 바뀐다"는 감각이 유지되어야 하기 때문이다.
 *
 * Category 탭으로 나누지 않는 이유: 100개는 한 목록으로 훑을 수 있는 크기이고,
 * 탭은 "다른 Category에 뭐가 있는지"를 숨긴다.
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
    const map = new Map<string, { name: string; holderCount: number }>();
    catalog?.categories.forEach((category) =>
      category.interests.forEach((interest) =>
        map.set(interest.id, {
          name: interest.name,
          holderCount: interest.holderCount,
        }),
      ),
    );
    return map;
  }, [catalog]);

  if (!catalog) {
    return <p className="muted">{error ?? '불러오는 중…'}</p>;
  }

  const { min, max } = catalog;
  const count = selected.size;
  const atMax = count >= max;
  const shortBy = Math.max(0, min - count);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < max) {
        next.add(id);
      }
      return next;
    });
  };

  const normalized = query.trim().toLowerCase();
  const visibleCategories = catalog.categories
    .map((category) => ({
      ...category,
      interests: normalized
        ? category.interests.filter((interest) =>
            interest.name.toLowerCase().includes(normalized),
          )
        : category.interests,
    }))
    .filter((category) => category.interests.length > 0);

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

  return (
    <div>
      <div className="sticky-bar stack">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="관심사 검색"
        />

        <div className="muted">
          {count}개 선택 · 최소 {min} · 최대 {max}
        </div>

        {/* 선택한 것은 스크롤해도 보이도록 상단에 고정한다. */}
        {count > 0 && (
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

      {visibleCategories.map((category) => (
        <div
          key={category.id}
          ref={(node) => {
            sectionRefs.current[category.id] = node;
          }}
        >
          <div className="category-title">{category.name}</div>
          <div className="chips">
            {category.interests.map((interest) => {
              const isSelected = selected.has(interest.id);
              return (
                <button
                  key={interest.id}
                  type="button"
                  className={`chip ${isSelected ? 'selected' : ''}`}
                  disabled={!isSelected && atMax}
                  onClick={() => toggle(interest.id)}
                >
                  {interest.name}
                  {/* 사람 수는 "여기 고르면 누가 있을지"의 힌트다. */}
                  <span className="count">{interest.holderCount}명</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {visibleCategories.length === 0 && (
        <p className="muted" style={{ marginTop: 24 }}>
          검색 결과가 없습니다. 원하는 관심사가 없다면 제안할 수 있습니다.
        </p>
      )}

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

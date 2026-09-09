import type { GraphResponse, InterestCatalog } from '@ssafy-net/shared';
import { useMemo, useState } from 'react';
import { categoryVar } from '../graph/encoding';

/**
 * 왼쪽 관심사 레일.
 *
 * 그래프에서 작은 노드를 찾아 누르는 것만이 유일한 진입로면 탐색이 힘들다.
 * 목록에서도 같은 선택을 할 수 있게 한다. 리스트가 우위인 곳은 리스트로 둔다
 * (docs/01 §7 — 그래프는 탐색과 이해, 행동과 관리는 리스트).
 *
 * 그래프에 있는 관심사는 선택하고, 그래프 밖 관심사는 앵커를 그쪽으로 옮긴다
 * (docs/07 §2.4 "그래프 밖에 N명 더 있음 · 중심으로 보기"와 같은 규칙).
 */
export function InterestRail({
  graph,
  catalog,
  selectedId,
  onSelect,
  onRecenter,
}: {
  graph: GraphResponse | null;
  catalog: InterestCatalog | null;
  selectedId: string | null;
  onSelect: (interestId: string) => void;
  onRecenter: (interestId: string) => void;
}) {
  const [query, setQuery] = useState('');

  const inGraph = useMemo(() => {
    const map = new Map<string, { name: string; categoryId: string; mine: boolean }>();
    graph?.nodes.forEach((node) => {
      if (node.kind === 'INTEREST') {
        map.set(node.id, {
          name: node.name,
          categoryId: node.categoryId,
          mine: node.mine,
        });
      }
    });
    return map;
  }, [graph]);

  const normalized = query.trim().toLowerCase();

  const searchResults = useMemo(() => {
    if (!normalized || !catalog) return [];
    return catalog.categories
      .flatMap((category) =>
        category.interests.map((interest) => ({ ...interest, category })),
      )
      .filter((interest) => interest.name.toLowerCase().includes(normalized))
      .slice(0, 30);
  }, [normalized, catalog]);

  const mine = [...inGraph].filter(([, value]) => value.mine);
  const adjacent = [...inGraph].filter(([, value]) => !value.mine);

  const Row = ({
    id,
    name,
    categoryId,
    suffix,
    onClick,
  }: {
    id: string;
    name: string;
    categoryId: string;
    suffix?: string;
    onClick: () => void;
  }) => (
    <button
      type="button"
      className={`rail-row ${selectedId === id ? 'selected' : ''}`}
      onClick={onClick}
    >
      <i style={{ background: categoryVar(categoryId) }} />
      <span className="rail-name">{name}</span>
      {suffix && <span className="rail-suffix">{suffix}</span>}
    </button>
  );

  return (
    <aside className="rail">
      <input
        type="text"
        className="rail-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="관심사 검색"
      />

      {normalized ? (
        <>
          <div className="rail-title">검색 결과</div>
          {searchResults.length === 0 && (
            <p className="rail-empty">결과가 없습니다.</p>
          )}
          {searchResults.map((interest) => (
            <Row
              key={interest.id}
              id={interest.id}
              name={interest.name}
              categoryId={interest.category.id}
              suffix={`${interest.holderCount}명`}
              onClick={() =>
                inGraph.has(interest.id)
                  ? onSelect(interest.id)
                  : onRecenter(interest.id)
              }
            />
          ))}
        </>
      ) : (
        <>
          <div className="rail-title">내 관심사</div>
          {mine.map(([id, value]) => (
            <Row
              key={id}
              id={id}
              name={value.name}
              categoryId={value.categoryId}
              onClick={() => onSelect(id)}
            />
          ))}

          {adjacent.length > 0 && (
            <>
              <div className="rail-title">
                이 그래프에 함께 보이는 관심사
              </div>
              {adjacent.map(([id, value]) => (
                <Row
                  key={id}
                  id={id}
                  name={value.name}
                  categoryId={value.categoryId}
                  onClick={() => onSelect(id)}
                />
              ))}
            </>
          )}

          <p className="rail-empty">
            목록에 없는 관심사는 검색해서 그 관심사를 중심으로 볼 수 있습니다.
          </p>
        </>
      )}
    </aside>
  );
}

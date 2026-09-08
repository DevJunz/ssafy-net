import type {
  ConnectedUser,
  ConnectionDetail,
  ConnectionSummary,
  GraphLink,
  GraphNode,
  GraphResponse,
  InterestCatalog,
  InterestDetail,
  PublicUser,
  SimilarPeopleResponse,
} from '@ssafy-net/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import {
  ConnectionOverlay,
  RequestComposeOverlay,
} from '../features/connections/Overlays';
import { GraphCanvas } from '../features/graph/GraphCanvas';
import { InterestRail } from '../features/panels/InterestRail';
import {
  BasePanel,
  InterestPanel,
  PersonPanel,
  SimilarPanel,
} from '../features/panels/Panels';
import '../features/panels/panels.css';
import { useSession } from '../session';

type Anchor = { type: 'ME' } | { type: 'INTEREST'; interestId: string };
type Selection =
  | { kind: 'PERSON'; id: string }
  | { kind: 'INTEREST'; id: string }
  | null;

/**
 * 그래프가 홈이다(D-22). 그래프 + 사이드 패널이 기본 틀이고,
 * Similar 모드는 별도 화면이 아니라 이 그래프의 상태다(docs/05 §1).
 *
 * 인터랙션 원칙(docs/07 §1)
 *   - 선택은 항상 0개 또는 1개
 *   - 모드는 선택과 독립. 모드 안에서 노드를 선택해도 모드가 유지된다
 *   - 배경 클릭은 한 단계만 되돌린다: 선택 → 모드
 *   - 카메라는 모드 전환과 앵커 변경 때만 자동으로 맞춘다
 */
export function GraphPage() {
  const { me } = useSession();
  const [anchor, setAnchor] = useState<Anchor>({ type: 'ME' });
  const [similarMode, setSimilarMode] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);

  const [base, setBase] = useState<GraphResponse | null>(null);
  const [similarEdges, setSimilarEdges] = useState<GraphResponse | null>(null);
  const [similarList, setSimilarList] = useState<SimilarPeopleResponse | null>(null);
  const [person, setPerson] = useState<PublicUser | ConnectedUser | null>(null);
  const [interest, setInterest] = useState<InterestDetail | null>(null);
  const [hoveredLink, setHoveredLink] = useState<GraphLink | null>(null);
  const [catalog, setCatalog] = useState<InterestCatalog | null>(null);
  const [composing, setComposing] = useState(false);
  const [openConnection, setOpenConnection] = useState<ConnectionDetail | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const areaRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const measure = () => {
      const node = areaRef.current;
      if (node) setSize({ width: node.clientWidth, height: node.clientHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const loadGraph = useCallback(async () => {
    const query =
      anchor.type === 'ME'
        ? '/graph?anchor=me'
        : `/graph?anchor=interest&interestId=${anchor.interestId}`;
    setBase(await api.get<GraphResponse>(query));
  }, [anchor]);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  // 추천 인원 수는 기본 패널에도 보여주므로 미리 받아 둔다.
  useEffect(() => {
    api
      .get<SimilarPeopleResponse>('/recommendations/similar-people')
      .then(setSimilarList)
      .catch(() => setSimilarList(null));
  }, []);

  // 레일의 검색은 전체 목록을 대상으로 한다. 그래프에 없는 관심사도 찾을 수 있어야 한다.
  useEffect(() => {
    api.get<InterestCatalog>('/interests').then(setCatalog).catch(() => {});
  }, []);

  useEffect(() => {
    if (!similarMode) {
      setSimilarEdges(null);
      return;
    }
    api.get<GraphResponse>('/graph/similar').then(setSimilarEdges).catch(() => {});
  }, [similarMode]);

  // ── 선택에 따른 상세 로딩
  useEffect(() => {
    if (selection?.kind !== 'PERSON') {
      setPerson(null);
      return;
    }
    api.get<PublicUser>(`/users/${selection.id}`).then(setPerson).catch(() => {});
  }, [selection]);

  useEffect(() => {
    if (selection?.kind !== 'INTEREST') {
      setInterest(null);
      return;
    }
    api
      .get<InterestDetail>(`/interests/${selection.id}`)
      .then(setInterest)
      .catch(() => {});
  }, [selection]);

  // ── 그래프 합성: 기본 + Similar 선 + Person Focus 임시 확장
  const merged = useMemo<GraphResponse | null>(() => {
    if (!base) return null;

    const nodes = new Map<string, GraphNode>(
      base.nodes.map((node) => [node.id, node]),
    );
    const links = [...base.links];

    if (similarMode && similarEdges) {
      for (const node of similarEdges.nodes) {
        if (!nodes.has(node.id)) nodes.set(node.id, node);
      }
      links.push(...similarEdges.links.filter((l) => l.kind === 'SIMILARITY'));
    }

    // Person Focus 시 그 사람의 관심사 중 그래프에 없던 것이 임시로 나타난다
    // (docs/06 §1.1). 선택을 해제하면 사라진다.
    if (selection?.kind === 'PERSON' && person && person.id === selection.id) {
      for (const ref of person.interests) {
        if (!nodes.has(ref.id)) {
          nodes.set(ref.id, {
            id: ref.id,
            kind: 'INTEREST',
            name: ref.name,
            categoryId: ref.categoryId,
            mine: false,
            holderCount: 0,
            adjacent: true,
          });
        }
        if (
          !links.some(
            (l) => l.source === person.id && l.target === ref.id,
          )
        ) {
          links.push({
            source: person.id,
            target: ref.id,
            kind: 'HAS_INTEREST',
          });
        }
      }
    }

    return { ...base, nodes: [...nodes.values()], links };
  }, [base, similarMode, similarEdges, selection, person]);

  // ── 강조 계산 (docs/06 §3.2 상태별 요구)
  const highlighted = useMemo<Set<string> | null>(() => {
    if (!merged || !me) return null;

    if (selection?.kind === 'PERSON') {
      const set = new Set<string>([selection.id]);
      for (const link of merged.links) {
        if (link.kind !== 'HAS_INTEREST') continue;
        if (link.source === selection.id) set.add(String(link.target));
      }
      return set;
    }

    if (selection?.kind === 'INTEREST') {
      const set = new Set<string>([selection.id]);
      for (const link of merged.links) {
        if (link.kind !== 'HAS_INTEREST') continue;
        if (link.target === selection.id) set.add(String(link.source));
      }
      return set;
    }

    if (similarMode && similarEdges) {
      const set = new Set<string>([me.id]);
      for (const link of similarEdges.links) set.add(String(link.target));
      return set;
    }

    return null;
  }, [merged, selection, similarMode, similarEdges, me]);

  /** 요청이 어디서 시작됐는지 기록한다. 진입점 분포가 지표다(docs/14 §2.3). */
  const entryPoint = similarMode
    ? 'SIMILAR'
    : selection?.kind === 'INTEREST'
      ? 'INTEREST_DETAIL'
      : 'PROFILE';

  const reloadPerson = async (id: string) => {
    setPerson(await api.get<PublicUser>(`/users/${id}`));
  };

  const openConnectionOf = async (userId: string) => {
    const list = await api.get<ConnectionSummary[]>('/connections');
    const found = list.find((item) => item.counterpart.id === userId);
    if (found) {
      setOpenConnection(await api.get<ConnectionDetail>(`/connections/${found.id}`));
    }
  };

  /** 카메라 자동 맞춤의 유일한 트리거(docs/07 §1). 선택은 여기에 들어가지 않는다. */
  const cameraKey = `${anchor.type}:${anchor.type === 'INTEREST' ? anchor.interestId : ''}:${similarMode}`;

  // ── 인터랙션
  const onNodeClick = (node: GraphNode) => {
    if (node.kind === 'INTEREST') {
      setSelection({ kind: 'INTEREST', id: node.id });
      return;
    }
    if (node.kind === 'ME' || node.kind === 'PERSON') {
      setSelection({ kind: 'PERSON', id: node.id });
    }
  };

  /** 배경 클릭은 한 단계만 되돌린다(docs/07 §2.7). */
  const onBackgroundClick = () => {
    if (selection) {
      setSelection(null);
      return;
    }
    if (similarMode) setSimilarMode(false);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onBackgroundClick();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const recenter = (interestId: string) => {
    // 앵커를 옮기면 모드는 꺼진다. 모드는 나 중심 그래프의 개념이다(docs/07 §2.5).
    setSimilarMode(false);
    setAnchor({ type: 'INTEREST', interestId });
  };

  const backToMyGraph = () => {
    setAnchor({ type: 'ME' });
    setSelection(null);
  };

  const addInterestToMine = async (interestId: string) => {
    await api.post(`/me/interests/${interestId}`);
    await loadGraph();
    setInterest(await api.get<InterestDetail>(`/interests/${interestId}`));
  };

  if (!me) return null;

  return (
    <div className="graph-layout">
      <InterestRail
        graph={base}
        catalog={catalog}
        selectedId={selection?.kind === 'INTEREST' ? selection.id : null}
        onSelect={(id) => setSelection({ kind: 'INTEREST', id })}
        onRecenter={recenter}
      />

      <div className="graph-area" ref={areaRef}>
        <div className="graph-toolbar">
          <span className="anchor-label">
            {anchor.type === 'ME'
              ? '내 그래프'
              : `#${base?.anchor.type === 'INTEREST' ? base.anchor.name : ''} 중심`}
          </span>

          {anchor.type === 'INTEREST' && (
            <button type="button" onClick={backToMyGraph}>
              내 그래프로 돌아가기
            </button>
          )}

          {anchor.type === 'ME' && (
            <button
              type="button"
              className={similarMode ? 'on' : ''}
              onClick={() => setSimilarMode((on) => !on)}
            >
              나와 비슷한 사람 보기
            </button>
          )}
        </div>

        {merged && (
          <GraphCanvas
            data={merged}
            highlighted={highlighted}
            selectedId={selection?.id ?? null}
            cameraKey={cameraKey}
            width={size.width}
            height={size.height}
            onNodeClick={onNodeClick}
            onBackgroundClick={onBackgroundClick}
            onLinkHover={setHoveredLink}
          />
        )}

        <div className="graph-corner">
          {hoveredLink?.kind === 'SIMILARITY' ? (
            <>공통 관심사 {hoveredLink.commonCount}개 — 관심사가 겹친다는 뜻입니다</>
          ) : (
            base && (
              <>
                {base.truncated.people > 0 && `사람 ${base.truncated.people}명 더 있음`}
                {base.truncated.people > 0 && base.truncated.interests > 0 && ' · '}
                {base.truncated.interests > 0 &&
                  `관심사 ${base.truncated.interests}개 더 있음`}
              </>
            )
          )}
        </div>
      </div>

      {selection?.kind === 'PERSON' && person ? (
        <PersonPanel
          person={person}
          onSelectInterest={(id) => setSelection({ kind: 'INTEREST', id })}
          onRequest={() => setComposing(true)}
          onOpenConnection={() => void openConnectionOf(person.id)}
        />
      ) : selection?.kind === 'INTEREST' && interest ? (
        <InterestPanel
          detail={interest}
          isAnchor={
            anchor.type === 'INTEREST' && anchor.interestId === interest.id
          }
          onRecenter={() => recenter(interest.id)}
          onSelectPerson={(id) => setSelection({ kind: 'PERSON', id })}
          onAddToMine={() => void addInterestToMine(interest.id)}
          onReload={async () => {
            setInterest(
              await api.get<InterestDetail>(`/interests/${interest.id}`),
            );
          }}
        />
      ) : similarMode && similarList ? (
        <SimilarPanel
          data={similarList}
          onSelectPerson={(id) => setSelection({ kind: 'PERSON', id })}
          onClose={() => setSimilarMode(false)}
        />
      ) : (
        <BasePanel
          graph={base}
          similarTotal={similarList?.total ?? null}
          onSimilarMode={() => setSimilarMode(true)}
        />
      )}

      {composing && person && (
        <RequestComposeOverlay
          target={person}
          entryPoint={entryPoint}
          onClose={() => setComposing(false)}
          onSent={(warning) => {
            setComposing(false);
            setToast(warning ?? `${person.displayName}님에게 요청을 보냈습니다.`);
            void reloadPerson(person.id);
            void loadGraph();
          }}
        />
      )}

      {openConnection && (
        <ConnectionOverlay
          detail={openConnection}
          onClose={() => setOpenConnection(null)}
          onMarked={() => {}}
        />
      )}

      {toast && (
        <div className="toast">
          {toast}
          <button type="button" onClick={() => setToast(null)}>닫기</button>
        </div>
      )}
    </div>
  );
}

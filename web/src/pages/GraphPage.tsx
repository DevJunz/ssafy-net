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
import { MAX_ANCHOR_INTERESTS } from '@ssafy-net/shared';
import { XIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { track } from '../analytics';
import { api } from '../api/client';
import {
  Page,
  PageLede,
  PageTitle,
  ScrollPage,
} from '../components/primitives';
import { GRAPH_MIN_WIDTH_QUERY, useMediaQuery } from '../components/useMediaQuery';
import {
  ConnectionOverlay,
  RequestComposeOverlay,
} from '../features/connections/Overlays';
import { GraphCanvas } from '../features/graph/GraphCanvas';
import { PanelResizeHandle } from '../features/graph/PanelResizeHandle';
import { PANEL_LIMITS, WIDE_QUERY, usePanelWidths } from '../features/graph/usePanelWidths';
import { InterestRail } from '../features/panels/InterestRail';
import {
  BasePanel,
  InterestPanel,
  PersonPanel,
  SimilarPanel,
} from '../features/panels/Panels';
import { useSession } from '../session';

/** 앵커 관심사는 하나 이상이다. 둘 이상이면 모두 가진 사람만 보인다(D-76). */
type Anchor = { type: 'ME' } | { type: 'INTEREST'; interestIds: string[] };
type Selection =
  | { kind: 'PERSON'; id: string }
  | { kind: 'INTEREST'; id: string }
  | null;
/** 앵커를 어디서 바꿨는지. 측정용(shared/events.ts `graph.anchor_change`). */
type AnchorVia = 'panel' | 'shift' | 'chip' | 'back';

/** 툴바 위 반투명 작은 상자(앵커 설명, 구석 안내) */
const glassClass =
  'rounded-md border bg-white/90 px-2.5 py-1.5 text-[12.5px] text-muted-foreground';

/**
 * 그래프가 홈이다(D-22). 그래프 + 사이드 패널이 기본 틀이고,
 * Similar 모드는 별도 화면이 아니라 이 그래프의 상태다(docs/05 §1).
 *
 * 인터랙션 원칙(docs/07 §1)
 *   - 선택은 항상 0개 또는 1개. 앵커 관심사는 여럿일 수 있다(D-76) — 선택과 다른 개념이다
 *   - 모드는 선택과 독립. 모드 안에서 노드를 선택해도 모드가 유지된다
 *   - 배경 클릭은 한 단계만 되돌린다: 선택 → 모드
 *   - 카메라는 모드 전환과 앵커 변경 때만 자동으로 맞춘다
 */
export function GraphPage() {
  const { me } = useSession();
  const wideEnough = useMediaQuery(GRAPH_MIN_WIDTH_QUERY);
  // 양쪽 패널 폭. 손잡이를 끌어 바꾸면 브라우저에 남는다.
  const panels = usePanelWidths(useMediaQuery(WIDE_QUERY));
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

  const areaRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  // 창 크기뿐 아니라 패널 폭을 끌어 바꿀 때도 캔버스가 따라온다.
  // 좁은 화면에서는 그래프 영역이 없으므로 넓어질 때 다시 붙인다.
  useEffect(() => {
    const node = areaRef.current;
    if (!node) return;
    const measure = () =>
      setSize({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [wideEnough]);

  const loadGraph = useCallback(async () => {
    const query =
      anchor.type === 'ME'
        ? '/graph?anchor=me'
        : `/graph?anchor=interest&interestIds=${anchor.interestIds.join(',')}`;
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

  const anchorIds = anchor.type === 'INTEREST' ? anchor.interestIds : [];
  const peopleShown = base?.nodes.filter((node) => node.kind === 'PERSON').length ?? 0;

  /** 카메라 자동 맞춤의 유일한 트리거(docs/07 §1). 선택은 여기에 들어가지 않는다. */
  const cameraKey = `${anchor.type}:${anchorIds.join(',')}:${similarMode}`;

  /** 칩과 패널 제목에 쓸 이름. 응답 → 그래프 노드 → 전체 목록 순으로 찾는다. */
  const interestNameOf = (id: string): string => {
    if (base?.anchor.type === 'INTEREST') {
      const hit = base.anchor.interests.find((item) => item.id === id);
      if (hit?.name) return hit.name;
    }
    const node = base?.nodes.find((item) => item.id === id);
    if (node?.kind === 'INTEREST') return node.name;
    for (const category of catalog?.categories ?? []) {
      const hit = category.interests.find((item) => item.id === id);
      if (hit) return hit.name;
    }
    return '…';
  };

  // ── 앵커
  /**
   * 앵커가 바뀌는 순간을 기록한다. 서버는 결과(GET /graph)만 보고
   * 어느 버튼으로 바꿨는지는 모른다(shared/events.ts).
   */
  const trackAnchorChange = (
    to: 'me' | 'interest',
    interestCount: number,
    via: AnchorVia,
  ) => {
    track('graph.anchor_change', {
      from: anchor.type === 'ME' ? 'me' : 'interest',
      to,
      interestCount,
      via,
    });
  };

  const backToMyGraph = (via: AnchorVia = 'back') => {
    trackAnchorChange('me', 0, via);
    setAnchor({ type: 'ME' });
    setSelection(null);
  };

  const recenter = (interestId: string, via: AnchorVia = 'panel') => {
    // 앵커를 옮기면 모드는 꺼진다. 모드는 나 중심 그래프의 개념이다(docs/07 §2.5).
    setSimilarMode(false);
    trackAnchorChange('interest', 1, via);
    setAnchor({ type: 'INTEREST', interestIds: [interestId] });
  };

  /** 앵커에 관심사를 더한다. 더할수록 사람은 준다 — 모두 가진 사람만 남기 때문이다(D-76). */
  const addToAnchor = (interestId: string, via: AnchorVia = 'panel') => {
    if (anchorIds.includes(interestId)) return;
    if (anchorIds.length >= MAX_ANCHOR_INTERESTS) {
      toast(`관심사는 ${MAX_ANCHOR_INTERESTS}개까지 함께 볼 수 있습니다.`);
      return;
    }
    setSimilarMode(false);
    trackAnchorChange('interest', anchorIds.length + 1, via);
    setAnchor({ type: 'INTEREST', interestIds: [...anchorIds, interestId] });
  };

  const removeFromAnchor = (interestId: string, via: AnchorVia = 'panel') => {
    const rest = anchorIds.filter((id) => id !== interestId);
    if (rest.length === 0) {
      backToMyGraph(via);
      return;
    }
    trackAnchorChange('interest', rest.length, via);
    setAnchor({ type: 'INTEREST', interestIds: rest });
    // 뺀 관심사가 선택돼 있었으면 선택도 푼다. 그래프에서 사라질 수 있다.
    if (selection?.kind === 'INTEREST' && selection.id === interestId) {
      setSelection(null);
    }
  };

  /** 모드를 끄는 것만 기록한다. 켜는 것은 서버가 본다(GET /graph/similar). */
  const turnSimilarOff = (via: 'toggle' | 'panel' | 'background') => {
    track('graph.similar_mode', { on: false, via });
    setSimilarMode(false);
  };

  // ── 인터랙션
  const onNodeClick = (node: GraphNode, event: MouseEvent) => {
    if (node.kind === 'INTEREST') {
      // Shift+클릭은 앵커에 넣고 빼는 지름길이다. 패널의 버튼과 같은 일을 한다.
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        if (anchorIds.includes(node.id)) removeFromAnchor(node.id, 'shift');
        else addToAnchor(node.id, 'shift');
        return;
      }
      track('graph.interest_click', {
        adjacent: node.adjacent ?? false,
        mine: node.mine,
      });
      setSelection({ kind: 'INTEREST', id: node.id });
      return;
    }
    if (node.kind === 'ME' || node.kind === 'PERSON') {
      track('graph.person_click', { me: node.kind === 'ME' });
      setSelection({ kind: 'PERSON', id: node.id });
    }
  };

  /** 배경 클릭은 한 단계만 되돌린다(docs/07 §2.7). */
  const onBackgroundClick = (via: 'click' | 'escape' = 'click') => {
    if (selection) {
      track('graph.background_click', { cleared: 'selection', via });
      setSelection(null);
      return;
    }
    if (similarMode) {
      track('graph.background_click', { cleared: 'mode', via });
      turnSimilarOff('background');
      return;
    }
    track('graph.background_click', { cleared: 'none', via });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onBackgroundClick('escape');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const addInterestToMine = async (interestId: string) => {
    await api.post(`/me/interests/${interestId}`);
    await loadGraph();
    setInterest(await api.get<InterestDetail>(`/interests/${interestId}`));
  };

  if (!me) return null;

  // 그래프는 PC 전용이다(docs/06 §5). 좁은 화면은 요청 처리와 성립 확인만 한다.
  if (!wideEnough) {
    return (
      <ScrollPage>
        <Page>
          <PageTitle>그래프는 PC에서 볼 수 있습니다</PageTitle>
          <PageLede>
            휴대폰에서는 받은 요청을 처리하고 성립된 연결을 확인할 수 있습니다.
            그래프에서 사람을 찾는 것은 넓은 화면에서 해주세요.
          </PageLede>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild>
              <Link to="/connections">연결</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/notifications">알림</Link>
            </Button>
          </div>
        </Page>
      </ScrollPage>
    );
  }

  return (
    <div
      className="relative grid h-full overflow-hidden bg-secondary"
      style={{
        gridTemplateColumns: `${panels.widths.left}px 1fr ${panels.widths.right}px`,
      }}
    >
      <InterestRail
        graph={base}
        catalog={catalog}
        selectedId={selection?.kind === 'INTEREST' ? selection.id : null}
        anchorIds={anchorIds}
        onSelect={(id) => setSelection({ kind: 'INTEREST', id })}
        onRecenter={(id) => recenter(id, 'panel')}
      />

      <div className="relative overflow-hidden bg-[var(--graph-bg)]" ref={areaRef}>
        <div className="pointer-events-none absolute top-3.5 right-3.5 left-3.5 z-[2] flex flex-wrap items-center gap-2 [&>*]:pointer-events-auto">
          {/* 내 그래프일 때는 아무 표시도 없다. 앵커 관심사가 있을 때만 칩이 나온다 */}
          {anchor.type === 'INTEREST' && (
            // 앵커 관심사 칩. 둘 이상이면 "모두 가진 사람"만 보이는 상태다(D-76).
            <div className="flex flex-wrap items-center gap-1.5">
              {anchorIds.map((id) => (
                <Tooltip key={id}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="group h-auto gap-0.5 rounded-full border border-primary/30 bg-accent py-[5px] pr-[9px] pl-3 text-[13px] font-medium text-accent-foreground shadow-xs hover:bg-accent/70"
                      aria-label={`#${interestNameOf(id)} 함께 보기에서 빼기`}
                      onClick={() => removeFromAnchor(id, 'chip')}
                    >
                      #{interestNameOf(id)}
                      <XIcon
                        className="size-3.5 opacity-60 group-hover:opacity-100"
                        aria-hidden="true"
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>함께 보기에서 빼기</TooltipContent>
                </Tooltip>
              ))}
              <span className={glassClass}>
                {anchorIds.length === 1 ? (
                  '중심'
                ) : (
                  <>
                    모두 가진 사람{' '}
                    <b className="font-semibold text-foreground">
                      {peopleShown + (base?.truncated.people ?? 0)}명
                    </b>
                  </>
                )}
              </span>
            </div>
          )}

          {anchor.type === 'INTEREST' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-card shadow-xs hover:bg-card hover:shadow-md"
              onClick={() => backToMyGraph('back')}
            >
              내 그래프로 돌아가기
            </Button>
          )}

          {anchor.type === 'ME' && (
            <Toggle
              variant="outline"
              size="sm"
              pressed={similarMode}
              onPressedChange={(on) =>
                on ? setSimilarMode(true) : turnSimilarOff('toggle')
              }
              className="bg-card px-3 shadow-xs hover:bg-card hover:text-foreground hover:shadow-md data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90"
            >
              나와 비슷한 사람 보기
            </Toggle>
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
            onBackgroundClick={() => onBackgroundClick('click')}
            onLinkHover={setHoveredLink}
          />
        )}

        <div className={`absolute bottom-4 left-4 z-[2] ${glassClass} text-xs`}>
          {hoveredLink?.kind === 'SIMILARITY' ? (
            <>공통 관심사 {hoveredLink.commonCount}개 — 관심사가 겹친다는 뜻입니다</>
          ) : base && anchorIds.length > 1 && peopleShown === 0 ? (
            <>이 관심사를 모두 가진 사람이 없습니다. 칩의 ×로 하나를 빼 보세요</>
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
          anchorCount={anchorIds.length}
          inAnchor={anchorIds.includes(interest.id)}
          onRecenter={() => recenter(interest.id, 'panel')}
          onAddToAnchor={() => addToAnchor(interest.id, 'panel')}
          onRemoveFromAnchor={() => removeFromAnchor(interest.id, 'panel')}
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
          onClose={() => turnSimilarOff('panel')}
        />
      ) : (
        <BasePanel
          graph={base}
          anchorNames={anchorIds.map(interestNameOf)}
          similarTotal={similarList?.total ?? null}
          onSimilarMode={() => setSimilarMode(true)}
        />
      )}

      {/* 패널과 그래프 사이 손잡이. 끌어서 폭을 바꾸고, 두 번 누르면 기본 폭이다 */}
      <PanelResizeHandle
        side="left"
        width={panels.widths.left}
        min={PANEL_LIMITS.left.min}
        max={PANEL_LIMITS.left.max}
        label="관심사 레일 폭"
        onResize={(px) => panels.resize('left', px)}
        onReset={panels.reset}
      />
      <PanelResizeHandle
        side="right"
        width={panels.widths.right}
        min={PANEL_LIMITS.right.min}
        max={PANEL_LIMITS.right.max}
        label="상세 패널 폭"
        onResize={(px) => panels.resize('right', px)}
        onReset={panels.reset}
      />

      {composing && person && (
        <RequestComposeOverlay
          target={person}
          entryPoint={entryPoint}
          onClose={() => setComposing(false)}
          onSent={(warning) => {
            setComposing(false);
            toast(warning ?? `${person.displayName}님에게 요청을 보냈습니다.`);
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
    </div>
  );
}

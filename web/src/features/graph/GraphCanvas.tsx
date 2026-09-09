import type { GraphLink, GraphNode, GraphResponse } from '@ssafy-net/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import {
  colorOf,
  labelOf,
  radiusOf,
  readGraphPalette,
  registerCategories,
  relationMark,
  transparentOf,
} from './encoding';

type RenderNode = GraphNode & { x?: number; y?: number; fx?: number; fy?: number };
type RenderLink = Omit<GraphLink, 'source' | 'target'> & {
  source: RenderNode | string;
  target: RenderNode | string;
};

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 6;
/** 휠 한 칸이 주는 배율. 작을수록 천천히 확대된다. */
const WHEEL_DAMPING = 0.0011;

/** 캔버스 글자. index.css 와 같은 글꼴이다 — 캔버스는 CSS 상속을 받지 못한다. */
const LABEL_FONT = "'Pretendard Variable', Pretendard, system-ui, sans-serif";

/** 사람 이름은 이 확대 구간에서 서서히 나타난다. 뚝 나타나면 화면이 튄다. */
const LABEL_FADE_START = 1.1;
const LABEL_FADE_END = 1.7;

/** 흐림 단계. 선택 밖으로 밀려난 것, hover 중 뒤로 물러난 것. */
const ALPHA_DIMMED = 0.14;
const ALPHA_BEHIND_HOVER = 0.3;
const ALPHA_SELECTED_BEHIND_HOVER = 0.5;

interface Props {
  data: GraphResponse;
  highlighted: Set<string> | null;
  selectedId: string | null;
  width: number;
  height: number;
  /** 이 값이 바뀔 때만 카메라를 자동으로 맞춘다(docs/07 §1). */
  cameraKey: string;
  /** 이벤트를 함께 준다. Shift+클릭 같은 보조 동작을 페이지가 정한다. */
  onNodeClick: (node: GraphNode, event: MouseEvent) => void;
  onBackgroundClick: () => void;
  onLinkHover: (link: GraphLink | null) => void;
}

const idOf = (end: RenderNode | string): string =>
  typeof end === 'string' ? end : end.id;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

/**
 * hover 툴팁(docs/07 §2.1, §2.3). 라이브러리가 HTML로 넣으므로
 * 이름은 반드시 이스케이프한다 — 표시명과 관심사 이름은 사용자 입력이다.
 */
function tooltipOf(node: GraphNode): string {
  if (node.kind === 'INTEREST') {
    const tail = node.mine ? ' · 내 관심사' : node.adjacent ? ' · 인접 관심사' : '';
    return `<b>#${escapeHtml(node.name)}</b><br>${node.holderCount}명${tail}`;
  }
  if (node.kind === 'NETWORK_HUB') {
    return `<b>네트워크</b><br>${node.memberCount}명`;
  }
  const real = node.displayNameType === 'REAL' ? ' <i>실명</i>' : '';
  if (node.kind === 'ME') {
    return `<b>${escapeHtml(node.displayName)}</b>${real}<br>나`;
  }
  const mark = relationMark(node);
  return `<b>${escapeHtml(node.displayName)}</b>${real}<br>공통 관심사 ${node.commonCount}개${
    mark ? ` · ${mark}` : ''
  }`;
}

export function GraphCanvas({
  data,
  highlighted,
  selectedId,
  width,
  height,
  cameraKey,
  onNodeClick,
  onBackgroundClick,
  onLinkHover,
}: Props) {
  const ref = useRef<ForceGraphMethods<RenderNode, RenderLink> | undefined>(
    undefined,
  );

  // 색의 출처는 CSS 토큰 하나다(index.css). 처음 그릴 때 한 번 읽는다.
  const palette = useMemo(() => readGraphPalette(), []);

  const [hoverId, setHoverId] = useState<string | null>(null);

  /**
   * 노드 객체를 재사용한다.
   *
   * 매번 새 객체를 넘기면 힘 시뮬레이션이 위치를 잃고 처음부터 다시 계산한다.
   * 사람 하나를 눌렀을 뿐인데 그래프 전체가 출렁이는 원인이 이것이었다.
   * 같은 id면 같은 객체를 주어 x/y가 유지되게 한다.
   */
  const cache = useRef(new Map<string, RenderNode>());

  /**
   * 노드·선 구성이 실제로 바뀔 때만 graphData의 정체성을 바꾼다.
   * 선택만 바뀐 경우에는 같은 객체를 유지해 시뮬레이션을 건드리지 않는다.
   */
  const signature = useMemo(
    () =>
      `${data.nodes.map((n) => n.id).join(',')}|${data.links
        .map((l) => `${String(l.source)}>${String(l.target)}`)
        .join(',')}`,
    [data],
  );

  const graphData = useMemo(() => {
    registerCategories(
      data.nodes
        .filter((node) => node.kind === 'INTEREST')
        .map((node) => node.categoryId),
    );

    const nodes = data.nodes.map((node) => {
      const existing = cache.current.get(node.id);
      if (existing) {
        // 좌표는 유지하고 표시용 값만 갱신한다.
        Object.assign(existing, node);
        return existing;
      }
      const created: RenderNode = { ...node };
      cache.current.set(node.id, created);
      return created;
    });

    const alive = new Set(nodes.map((n) => n.id));
    for (const id of [...cache.current.keys()]) {
      if (!alive.has(id)) cache.current.delete(id);
    }

    return {
      nodes,
      links: data.links.map((link) => ({ ...link })) as unknown as RenderLink[],
    };
    // signature가 같으면 재계산하지 않는다 — 선택이 바뀌어도 그래프는 그대로다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  /** 이웃 표. hover 때 그 노드에 붙은 것만 밝히기 위해서다. */
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const add = (a: string, b: string) => {
      let set = map.get(a);
      if (!set) {
        set = new Set();
        map.set(a, set);
      }
      set.add(b);
    };
    for (const link of graphData.links) {
      const a = idOf(link.source);
      const b = idOf(link.target);
      add(a, b);
      add(b, a);
    }
    return map;
  }, [graphData]);

  const hoverSet = useMemo(() => {
    if (!hoverId) return null;
    return new Set<string>([hoverId, ...(neighbors.get(hoverId) ?? [])]);
  }, [hoverId, neighbors]);

  // 그래프가 바뀌어 hover 대상이 사라지면 상태도 비운다.
  useEffect(() => {
    if (hoverId && !cache.current.has(hoverId)) setHoverId(null);
  }, [graphData, hoverId]);

  // 카메라 자동 맞춤은 앵커 변경과 모드 전환에서만 일어난다(docs/07 §1, §2.5).
  useEffect(() => {
    const timer = setTimeout(() => ref.current?.zoomToFit(500, 70), 350);
    return () => clearTimeout(timer);
  }, [cameraKey]);

  const zoomBy = useCallback((factor: number) => {
    const fg = ref.current;
    if (!fg) return;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fg.zoom() * factor));
    fg.zoom(next, 180);
  }, []);

  /** 휠 확대를 직접 다룬다. 기본 동작은 한 칸에 너무 많이 움직인다. */
  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      zoomBy(Math.exp(-event.deltaY * WHEEL_DAMPING));
    },
    [zoomBy],
  );

  /**
   * 불투명도 규칙(docs/06 §2 강조/흐림/선택, docs/07 §2.1 예외).
   *   - 선택·모드가 정한 강조 집합 밖은 흐리다
   *   - hover 중에는 그 노드와 이웃만 온전하고, 나머지는 뒤로 물러난다.
   *     흐려진 사람 위에 올려도 반응해야 한다 — 탐색이 끊기면 안 된다
   */
  const alphaOf = (id: string): number => {
    if (hoverSet) {
      if (hoverSet.has(id)) return 1;
      if (highlighted) {
        return highlighted.has(id) ? ALPHA_SELECTED_BEHIND_HOVER : ALPHA_DIMMED * 0.7;
      }
      return ALPHA_BEHIND_HOVER;
    }
    if (highlighted) return highlighted.has(id) ? 1 : ALPHA_DIMMED;
    return 1;
  };

  const linkAlphaOf = (a: string, b: string): number => {
    const base = Math.min(alphaOf(a), alphaOf(b));
    // hover 중에는 그 노드에 닿은 선만 온전하다. 이웃끼리의 선은 반쯤 물러난다.
    if (hoverSet && a !== hoverId && b !== hoverId) return Math.min(base, 0.45);
    return base;
  };

  const ends = (link: RenderLink): [RenderNode, RenderNode] | null => {
    if (typeof link.source === 'string' || typeof link.target === 'string') return null;
    const { source, target } = link;
    if (source.x == null || source.y == null || target.x == null || target.y == null) {
      return null;
    }
    return [source, target];
  };

  /** 선 3종이 서로 달라야 한다(docs/06 §2): 소속은 가늘게, Similarity는 붉게, 허브는 점선. */
  const drawLink = (link: RenderLink, ctx: CanvasRenderingContext2D) => {
    const pair = ends(link);
    if (!pair) return;
    const [source, target] = pair;
    const similarity = link.kind === 'SIMILARITY';
    const hub = link.kind === 'HUB_MEMBER';
    const alpha = linkAlphaOf(source.id, target.id);

    // 소속 선은 원래 옅어서 흐림을 그대로 곱하면 사라진다. 바닥을 둔다.
    ctx.globalAlpha = similarity ? alpha : 0.3 + 0.7 * alpha;
    ctx.beginPath();
    ctx.moveTo(source.x!, source.y!);
    ctx.lineTo(target.x!, target.y!);
    ctx.strokeStyle = similarity ? palette.similar : hub ? palette.hub : palette.edge;
    ctx.lineWidth = similarity ? 1.6 : hub ? 1.2 : 0.8;
    if (hub) ctx.setLineDash([3, 2]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Similarity Edge의 숫자 배지. 선보다 크게 그려 hover 대상이 되게 한다
    // (docs/07 §2.11 — 선이 겹쳐 가리키기 어려울 때를 위해).
    if (similarity && typeof link.commonCount === 'number') {
      const x = (source.x! + target.x!) / 2;
      const y = (source.y! + target.y!) / 2;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, 2 * Math.PI);
      ctx.fillStyle = palette.similar;
      ctx.fill();
      ctx.font = `700 8px ${LABEL_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = palette.onAccent;
      ctx.fillText(String(link.commonCount), x, y);
    }
    ctx.globalAlpha = 1;
  };

  /** 포인터 판정 영역. 배지까지 넣어 선이 겹쳐도 배지를 가리킬 수 있게 한다. */
  const paintLinkPointerArea = (
    link: RenderLink,
    color: string,
    ctx: CanvasRenderingContext2D,
  ) => {
    const pair = ends(link);
    if (!pair) return;
    const [source, target] = pair;
    const similarity = link.kind === 'SIMILARITY';
    ctx.strokeStyle = color;
    ctx.lineWidth = similarity ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(source.x!, source.y!);
    ctx.lineTo(target.x!, target.y!);
    ctx.stroke();
    if (similarity) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc((source.x! + target.x!) / 2, (source.y! + target.y!) / 2, 8, 0, 2 * Math.PI);
      ctx.fill();
    }
  };

  const drawNode = (n: RenderNode, ctx: CanvasRenderingContext2D, scale: number) => {
    if (n.x == null || n.y == null) return;

    const alpha = alphaOf(n.id);
    const selected = n.id === selectedId;
    const hovered = n.id === hoverId;
    // hover 하면 살짝 커진다(docs/07 §2.1).
    const radius = radiusOf(n) + (hovered ? 1.5 : 0);
    const color = colorOf(n, palette);

    ctx.globalAlpha = alpha;

    // 빛무리. 나·선택·hover 에만 준다 — 전부 빛나면 아무것도 빛나지 않는다.
    if (n.kind === 'ME' || selected || hovered) {
      const reach = radius * 3;
      const glowColor = n.kind === 'ME' ? palette.meGlow : palette.glow;
      const glow = ctx.createRadialGradient(n.x, n.y, radius * 0.5, n.x, n.y, reach);
      glow.addColorStop(0, glowColor);
      glow.addColorStop(1, transparentOf(glowColor));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(n.x, n.y, reach, 0, 2 * Math.PI);
      ctx.fill();
    }

    if (selected) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius + 5, 0, 2 * Math.PI);
      ctx.fillStyle = palette.halo;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    // 내 관심사와 인접 관심사를 테두리로 구분한다(docs/06 §2).
    if (n.kind === 'INTEREST' && !n.mine) {
      ctx.fillStyle = palette.bg;
      ctx.beginPath();
      ctx.arc(n.x, n.y, Math.max(2, radius - 2.2), 0, 2 * Math.PI);
      ctx.fill();
    }

    if (selected || hovered) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius + 2.5, 0, 2 * Math.PI);
      ctx.strokeStyle = palette.mark;
      ctx.lineWidth = selected ? 1.8 : 1.2;
      ctx.stroke();
    }

    // 관심사 이름은 항상 보인다. 사람 이름은 확대에 따라 서서히 나타나되,
    // 강조·선택·hover 된 사람의 이름은 항상 보인다(docs/06 §2, docs/07 §2.1).
    const inFocus = hoverSet
      ? hoverSet.has(n.id)
      : highlighted !== null && highlighted.has(n.id);
    const forced =
      n.kind === 'INTEREST' || n.kind === 'ME' || selected || hovered || inFocus;
    const labelAlpha = forced
      ? 1
      : clamp01((scale - LABEL_FADE_START) / (LABEL_FADE_END - LABEL_FADE_START));

    if (labelAlpha > 0.02) {
      ctx.globalAlpha = alpha * labelAlpha;
      const isInterest = n.kind === 'INTEREST';
      ctx.font = `${isInterest ? 600 : 450} ${isInterest ? 5 : 4}px ${LABEL_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = isInterest ? palette.label : palette.label2;
      ctx.fillText(labelOf(n), n.x, n.y + radius + 2.5);

      const mark = relationMark(n);
      if (mark) {
        ctx.font = `500 3.4px ${LABEL_FONT}`;
        ctx.fillStyle = palette.mark;
        ctx.fillText(mark, n.x, n.y + radius + 8);
      }
      // 실명 사용자 표시(FR-0.5). 닉네임 사용자와 혼동되지 않게.
      if (n.kind === 'PERSON' && n.displayNameType === 'REAL') {
        ctx.font = `500 3.4px ${LABEL_FONT}`;
        ctx.fillStyle = palette.real;
        ctx.fillText('실명', n.x, n.y - radius - 5.5);
      }
    }

    ctx.globalAlpha = 1;
  };

  return (
    <div className="graph-canvas" onWheel={onWheel}>
      <ForceGraph2D
        ref={ref}
        width={width}
        height={height}
        graphData={graphData}
        backgroundColor={palette.bg}
        // 확대는 위에서 직접 처리한다. 이동(드래그)은 그대로 둔다.
        enableZoomInteraction={false}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        warmupTicks={40}
        cooldownTicks={90}
        d3AlphaDecay={0.035}
        d3VelocityDecay={0.42}
        nodeRelSize={1}
        nodeLabel={(node) => tooltipOf(node as GraphNode)}
        onNodeClick={(node, event) => onNodeClick(node as GraphNode, event)}
        onNodeHover={(node) => setHoverId(node ? (node as RenderNode).id : null)}
        onBackgroundClick={onBackgroundClick}
        onLinkHover={(link) =>
          onLinkHover(link ? (link as unknown as GraphLink) : null)
        }
        linkCanvasObjectMode={() => 'replace'}
        linkCanvasObject={(link, ctx) => drawLink(link as RenderLink, ctx)}
        linkPointerAreaPaint={(link, color, ctx) =>
          paintLinkPointerArea(link as RenderLink, color, ctx)
        }
        nodeCanvasObject={(node, ctx, scale) => drawNode(node as RenderNode, ctx, scale)}
        nodePointerAreaPaint={(node, color, ctx) => {
          const n = node as RenderNode;
          if (n.x == null || n.y == null) return;
          ctx.beginPath();
          ctx.arc(n.x, n.y, radiusOf(n) + 3, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
      />

      {/* 확대·축소·맞춤 버튼 (docs/06 §3.2 "구석") */}
      <div className="graph-zoom">
        <button type="button" onClick={() => zoomBy(1.3)} aria-label="확대">＋</button>
        <button type="button" onClick={() => zoomBy(1 / 1.3)} aria-label="축소">－</button>
        <button type="button" onClick={() => ref.current?.zoomToFit(500, 70)}>맞춤</button>
      </div>
    </div>
  );
}

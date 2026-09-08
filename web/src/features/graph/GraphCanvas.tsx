import type { GraphLink, GraphNode, GraphResponse } from '@ssafy-net/shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import {
  colorOf,
  labelOf,
  radiusOf,
  registerCategories,
  relationMark,
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

interface Props {
  data: GraphResponse;
  highlighted: Set<string> | null;
  selectedId: string | null;
  width: number;
  height: number;
  /** 이 값이 바뀔 때만 카메라를 자동으로 맞춘다(docs/07 §1). */
  cameraKey: string;
  onNodeClick: (node: GraphNode) => void;
  onBackgroundClick: () => void;
  onLinkHover: (link: GraphLink | null) => void;
}

const idOf = (end: RenderNode | string): string =>
  typeof end === 'string' ? end : end.id;

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

  const dim = (id: string) => Boolean(highlighted) && !highlighted!.has(id);

  return (
    <div className="graph-canvas" onWheel={onWheel}>
      <ForceGraph2D
        ref={ref}
        width={width}
        height={height}
        graphData={graphData}
        backgroundColor="#fbfcfd"
        // 확대는 위에서 직접 처리한다. 이동(드래그)은 그대로 둔다.
        enableZoomInteraction={false}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        warmupTicks={40}
        cooldownTicks={90}
        d3AlphaDecay={0.035}
        d3VelocityDecay={0.42}
        nodeRelSize={1}
        onNodeClick={(node) => onNodeClick(node as GraphNode)}
        onBackgroundClick={onBackgroundClick}
        onLinkHover={(link) =>
          onLinkHover(link ? (link as unknown as GraphLink) : null)
        }
        linkColor={(link) => {
          const l = link as RenderLink;
          const faded = dim(idOf(l.source)) || dim(idOf(l.target));
          if (l.kind === 'SIMILARITY') return faded ? '#f8d7da' : '#e03131';
          return faded ? '#f1f3f5' : '#dee2e6';
        }}
        linkWidth={(link) => ((link as RenderLink).kind === 'SIMILARITY' ? 2 : 1)}
        linkCanvasObjectMode={(link) =>
          (link as RenderLink).kind === 'SIMILARITY' ? 'after' : undefined
        }
        linkCanvasObject={(link, ctx) => {
          // Similarity Edge의 숫자 배지. 선보다 크게 그려 hover 대상이 되게 한다
          // (docs/07 §2.11 — 선이 겹쳐 가리키기 어려울 때를 위해).
          const l = link as RenderLink;
          if (l.kind !== 'SIMILARITY' || typeof l.commonCount !== 'number') return;
          const source = l.source as RenderNode;
          const target = l.target as RenderNode;
          if (source.x == null || target.x == null) return;

          const x = (source.x + target.x!) / 2;
          const y = (source.y! + target.y!) / 2;
          const faded = dim(idOf(l.source)) || dim(idOf(l.target));

          ctx.beginPath();
          ctx.arc(x, y, 7, 0, 2 * Math.PI);
          ctx.fillStyle = faded ? '#ffe3e3' : '#e03131';
          ctx.fill();
          ctx.font = '700 8px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.fillText(String(l.commonCount), x, y);
        }}
        nodeCanvasObject={(node, ctx, scale) => {
          const n = node as RenderNode;
          if (n.x == null || n.y == null) return;

          const faded = dim(n.id);
          const selected = n.id === selectedId;
          const radius = radiusOf(n);

          ctx.globalAlpha = faded ? 0.14 : 1;

          if (selected) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, radius + 5, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(28,126,214,0.14)';
            ctx.fill();
          }

          ctx.beginPath();
          ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
          ctx.fillStyle = colorOf(n);
          ctx.fill();

          // 내 관심사와 인접 관심사를 테두리로 구분한다(docs/06 §2).
          if (n.kind === 'INTEREST' && !n.mine) {
            ctx.fillStyle = '#fbfcfd';
            ctx.beginPath();
            ctx.arc(n.x, n.y, Math.max(2, radius - 2.2), 0, 2 * Math.PI);
            ctx.fill();
          }

          if (selected) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, radius + 2.5, 0, 2 * Math.PI);
            ctx.strokeStyle = '#1c7ed6';
            ctx.lineWidth = 1.8;
            ctx.stroke();
          }

          // 관심사 이름은 항상 보인다. 사람 이름은 축소하면 숨기되
          // 강조된 사람의 이름은 항상 보인다(docs/06 §2).
          const showLabel =
            n.kind === 'INTEREST' ||
            n.kind === 'ME' ||
            selected ||
            scale > 1.5 ||
            (!faded && highlighted !== null);

          if (showLabel) {
            const isInterest = n.kind === 'INTEREST';
            ctx.font = `${isInterest ? 600 : 400} ${isInterest ? 5 : 4}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = isInterest ? '#212529' : '#495057';
            ctx.fillText(labelOf(n), n.x, n.y + radius + 2.5);

            const mark = relationMark(n);
            if (mark) {
              ctx.font = '3.4px system-ui, sans-serif';
              ctx.fillStyle = '#1c7ed6';
              ctx.fillText(mark, n.x, n.y + radius + 8);
            }
            // 실명 사용자 표시(FR-0.5). 닉네임 사용자와 혼동되지 않게.
            if (n.kind === 'PERSON' && n.displayNameType === 'REAL') {
              ctx.font = '3.4px system-ui, sans-serif';
              ctx.fillStyle = '#adb5bd';
              ctx.fillText('실명', n.x, n.y - radius - 5.5);
            }
          }

          ctx.globalAlpha = 1;
        }}
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

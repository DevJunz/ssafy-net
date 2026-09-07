import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import {
  baseLinks,
  baseNodes,
  buildNetworkLinks,
  buildSimilarLinks,
  computeFocus,
  endpointId,
  interestById,
  networkById,
  similarPeople,
  type GLink,
  type GNode,
  type GraphLink,
  type GraphNode,
  type Mode,
} from '../lib/graph';
import { ME_ID } from '../data/mock';

type Props = {
  mode: Mode;
  onNodeClick: (node: GraphNode) => void;
  onLinkClick: (link: GraphLink) => void;
  onBackgroundClick: () => void;
};

const withAlpha = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const DIM_ALPHA = 0.12;

export default function InterestGraph({ mode, onNodeClick, onLinkClick, onBackgroundClick }: Props) {
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const didInitialFit = useRef(false);

  // 컨테이너 크기에 맞춰 캔버스 크기 조정
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 모드에 따라 Person-Person 임시 edge를 추가한다.
  const extraLinks = useMemo<GraphLink[]>(() => {
    if (mode.type === 'similar') return buildSimilarLinks();
    if (mode.type === 'network') return buildNetworkLinks(mode.id);
    return [];
  }, [mode.type, mode.type === 'network' ? mode.id : null]);

  const graphData = useMemo(
    () => ({ nodes: baseNodes, links: [...baseLinks, ...extraLinks] }),
    [extraLinks],
  );

  const focus = useMemo(() => computeFocus(mode), [mode]);
  const selectedId =
    mode.type === 'person' || mode.type === 'interest'
      ? mode.id
      : mode.type === 'similar'
        ? mode.focusId
        : undefined;

  // 힘 설정: Interest는 크게 밀어내고, Person은 가볍게
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force('charge')?.strength((n: GraphNode) => (n.kind === 'interest' ? -420 : -45));
    fg.d3Force('link')?.distance((l: GraphLink) => (l.kind === 'membership' ? 42 : 90));
    if (import.meta.env.DEV) (window as unknown as { __fg?: unknown }).__fg = fg;
  }, []);

  // 모드 전환 시 카메라 이동
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    if (mode.type === 'network') {
      const members = new Set(networkById(mode.id)?.memberIds ?? []);
      const common = new Set(networkById(mode.id)?.commonInterestIds ?? []);
      const t = setTimeout(
        () => fg.zoomToFit(600, 80, (n) => members.has(String(n.id)) || common.has(String(n.id))),
        450,
      );
      return () => clearTimeout(t);
    }
    if (mode.type === 'similar' && !mode.focusId) {
      const ids = new Set([ME_ID, ...similarPeople(ME_ID).map((s) => s.userId)]);
      const t = setTimeout(() => fg.zoomToFit(600, 80, (n) => ids.has(String(n.id))), 450);
      return () => clearTimeout(t);
    }
    if (mode.type === 'explore' && didInitialFit.current) {
      fg.zoomToFit(600, 40);
    }
  }, [mode.type, mode.type === 'network' ? mode.id : null, mode.type === 'similar' ? mode.focusId : null]);

  return (
    <div ref={containerRef} className="graph-container">
      <ForceGraph2D<GNode, GLink>
        ref={fgRef}
        width={size.width}
        height={size.height}
        graphData={graphData}
        backgroundColor="#fafafa"
        cooldownTicks={220}
        warmupTicks={40}
        d3VelocityDecay={0.35}
        onEngineStop={() => {
          if (didInitialFit.current) return;
          didInitialFit.current = true;
          fgRef.current?.zoomToFit(500, 40);
        }}
        nodeVal={(n) => (n.kind === 'interest' ? 9 : n.isMe ? 2.2 : 1.3)}
        nodeLabel={(n) => (n.kind === 'interest' ? `#${n.name}` : n.name)}
        linkHoverPrecision={6}
        linkLabel={(l) => {
          if (l.kind === 'membership') return '';
          const names = l.common.map((i) => `#${interestById.get(i)?.name}`).join(' ');
          return `<div style="font-size:12px"><b>공통 관심사 ${l.common.length}개</b><br/>${names}</div>`;
        }}
        linkColor={(l) => {
          const dim = focus.active && !focus.links.has(l.id);
          if (l.kind === 'similar') return dim ? withAlpha('#e03131', DIM_ALPHA) : '#e03131';
          if (l.kind === 'network') return dim ? withAlpha('#5f3dc4', DIM_ALPHA) : '#5f3dc4';
          if (!focus.active) return '#d0d3d8';
          if (dim) return withAlpha('#adb5bd', DIM_ALPHA);
          const interest = interestById.get(endpointId(l.target));
          return interest ? interest.color : '#495057';
        }}
        linkWidth={(l) => {
          const hi = focus.active && focus.links.has(l.id);
          if (l.kind === 'similar') return focus.emphasisLink === l.id ? 4 : 2.2;
          if (l.kind === 'network') return 2.4;
          return hi ? 2 : 1;
        }}
        linkCanvasObjectMode={() => 'after'}
        linkCanvasObject={(l, ctx, scale) => {
          // Person-Person edge 가운데에 공통 관심사 개수 배지
          if (l.kind === 'membership') return;
          const s = l.source as GraphNode;
          const t = l.target as GraphNode;
          if (typeof s !== 'object' || typeof t !== 'object' || s.x == null || t.x == null) return;
          const dim = focus.active && !focus.links.has(l.id);
          const mx = (s.x + (t.x ?? 0)) / 2;
          const my = ((s.y ?? 0) + (t.y ?? 0)) / 2;
          const label = String(l.common.length);
          const fontSize = 11 / scale;
          ctx.save();
          ctx.globalAlpha = dim ? DIM_ALPHA : 1;
          ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
          const r = fontSize * 0.85;
          ctx.beginPath();
          ctx.arc(mx, my, r, 0, 2 * Math.PI);
          ctx.fillStyle = l.kind === 'similar' ? '#e03131' : '#5f3dc4';
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, mx, my);
          ctx.restore();
        }}
        nodeCanvasObject={(node, ctx, scale) => {
          if (node.x == null || node.y == null) return;
          const dim = focus.active && !focus.nodes.has(node.id);
          const isSelected = node.id === selectedId;
          ctx.save();
          ctx.globalAlpha = dim ? DIM_ALPHA : 1;

          if (node.kind === 'interest') {
            const r = 11;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = node.color;
            ctx.fill();
            if (isSelected) {
              ctx.lineWidth = 3 / scale;
              ctx.strokeStyle = '#111';
              ctx.stroke();
            }
            const fontSize = Math.max(12 / scale, 3);
            ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const label = `#${node.name}`;
            const w = ctx.measureText(label).width;
            const pad = 3 / scale;
            const y = node.y + r + 2 / scale;
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fillRect(node.x - w / 2 - pad, y - pad / 2, w + pad * 2, fontSize + pad);
            ctx.fillStyle = node.color;
            ctx.fillText(label, node.x, y);
          } else {
            const r = node.isMe ? 6 : 4.5;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = node.color;
            ctx.fill();
            if (isSelected) {
              ctx.lineWidth = 2.5 / scale;
              ctx.strokeStyle = '#111';
              ctx.stroke();
            }
            const fontSize = Math.max(10 / scale, 2.5);
            ctx.font = `${node.isMe ? 'bold ' : ''}${fontSize}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = node.isMe ? '#c92a2a' : '#343a40';
            ctx.fillText(node.name, node.x, node.y + r + 1.5 / scale);
          }
          ctx.restore();
        }}
        onNodeClick={(n) => onNodeClick(n)}
        onLinkClick={(l) => {
          if (l.kind !== 'membership') onLinkClick(l);
        }}
        onBackgroundClick={onBackgroundClick}
      />
    </div>
  );
}

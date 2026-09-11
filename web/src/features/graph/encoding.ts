import type { GraphInterestNode, GraphNode } from '@ssafy-net/shared';

/**
 * 그래프 시각 부호화 (docs/06 §2).
 *
 * 디자인 세부는 자유지만 아래 구분은 반드시 보여야 한다.
 *   나 / 다른 사람 / 관심사 / 허브 · Category 색 · 실명 여부 · 연결 상태
 *   강조 / 흐림 / 선택 · 내 관심사 / 인접 관심사 · 선 3종
 *
 * 세부 값(간격, 크기)은 문서로 확정하지 않고 써 보고 조정한다(D-34).
 *
 * 색 값의 출처는 index.css 의 토큰 하나뿐이다. 범례·레일 같은 DOM은 `var(--…)`를
 * 그대로 쓰고, 캔버스는 처음 그릴 때 readGraphPalette()로 계산된 값을 읽는다.
 */

// 분류 색 자리. 운영자가 분류를 만들 수 있으므로(D-86) 지금 있는 11개보다 넉넉히 둔다.
// 전부 유채색이다 — 회색은 사람의 것이라 여기에 넣지 않는다.
const CATEGORY_SLOTS = 14;
const categorySlots = new Map<string, number>();

/** Category마다 색 자리(1~14)를 준다. 처음 본 순서대로 배정하고, 넘치면 돌려 쓴다. */
export function categorySlot(categoryId: string): number {
  let slot = categorySlots.get(categoryId);
  if (slot === undefined) {
    slot = (categorySlots.size % CATEGORY_SLOTS) + 1;
    categorySlots.set(categoryId, slot);
  }
  return slot;
}

export function registerCategories(ids: string[]): void {
  for (const id of ids) categorySlot(id);
}

/** DOM에서 쓰는 Category 색. 토큰을 가리킨다. */
export function categoryVar(categoryId: string): string {
  return `var(--cat-${categorySlot(categoryId)})`;
}

export const ME_VAR = 'var(--graph-me)';
export const PERSON_VAR = 'var(--graph-person)';
export const INTEREST_VAR = 'var(--cat-1)';

/** 캔버스가 쓰는 색 한 벌. 토큰에서 읽은 계산값이다. */
export interface GraphPalette {
  bg: string;
  edge: string;
  similar: string;
  onAccent: string;
  label: string;
  label2: string;
  mark: string;
  real: string;
  person: string;
  me: string;
  hub: string;
  halo: string;
  glow: string;
  meGlow: string;
  categories: string[];
}

export function readGraphPalette(): GraphPalette {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    bg: token('--graph-bg'),
    edge: token('--graph-edge'),
    similar: token('--graph-similar'),
    onAccent: token('--on-accent'),
    label: token('--graph-label'),
    label2: token('--graph-label-2'),
    mark: token('--graph-mark'),
    real: token('--graph-real'),
    person: token('--graph-person'),
    me: token('--graph-me'),
    hub: token('--graph-hub'),
    halo: token('--graph-halo'),
    glow: token('--graph-glow'),
    meGlow: token('--graph-me-glow'),
    categories: Array.from({ length: CATEGORY_SLOTS }, (_, index) =>
      token(`--cat-${index + 1}`),
    ),
  };
}

/**
 * 같은 색의 완전 투명 버전. 빛무리 그라데이션의 바깥 끝에 쓴다.
 * 검정 투명으로 끝내면 가장자리가 탁해진다. 토큰은 `rgba(r, g, b, a)` 쉼표 표기다.
 */
export function transparentOf(color: string): string {
  const match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(color);
  if (!match) return 'rgba(0, 0, 0, 0)';
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, 0)`;
}

/**
 * 노드는 전부 원이다. 사각형·별도 만들어 봤지만 작은 노드에서 뭉개지고 이름표를 찌른다.
 * 구분은 **색과 크기**가 한다(docs/06 §2):
 *   사람 = 회색, 나 = 빨강 + 테두리 두 겹, 관심사 = 분류 색, 허브 = 주황.
 * **회색은 사람의 것이다** — 분류 색에 회색을 넣지 않는다. 그래야 "색이 있으면 관심사"가 성립한다.
 * 범례(Panels.tsx LegendDot)가 같은 규칙을 DOM 으로 그린다.
 */
export function traceNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
}

/** 관심사는 사람보다 크고 이름이 항상 보인다(FR-2.2). */
export function radiusOf(node: GraphNode): number {
  if (node.kind === 'ME') return 9;
  if (node.kind === 'PERSON') return 5;
  if (node.kind === 'NETWORK_HUB') return 12;
  return 8 + Math.min(6, Math.sqrt((node as GraphInterestNode).holderCount) / 2);
}

export function colorOf(node: GraphNode, palette: GraphPalette): string {
  if (node.kind === 'ME') return palette.me;
  if (node.kind === 'PERSON') return palette.person;
  if (node.kind === 'NETWORK_HUB') return palette.hub;
  return palette.categories[
    categorySlot((node as GraphInterestNode).categoryId) - 1
  ];
}

export function labelOf(node: GraphNode): string {
  if (node.kind === 'INTEREST') return node.name;
  if (node.kind === 'NETWORK_HUB') return '네트워크';
  return node.displayName;
}

/** 연결 상태 표시. 추천에서 이미 처리한 사람을 구분하기 위한 것이다(docs/06 §2). */
export function relationMark(node: GraphNode): string | null {
  if (node.kind !== 'PERSON') return null;
  switch (node.relation) {
    case 'CONNECTED':
      return '연결됨';
    case 'REQUEST_SENT':
      return '요청함';
    case 'REQUEST_RECEIVED':
      return '요청받음';
    case 'NO_RESPONSE':
      return '응답없음';
    case 'REJECTED':
      return '거절됨';
    default:
      return null;
  }
}

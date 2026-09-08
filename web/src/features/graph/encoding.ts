import type { GraphInterestNode, GraphNode } from '@ssafy-net/shared';

/**
 * 그래프 시각 부호화 (docs/06 §2).
 *
 * 디자인 세부는 자유지만 아래 구분은 반드시 보여야 한다.
 *   나 / 다른 사람 / 관심사 / 허브 · Category 색 · 실명 여부 · 연결 상태
 *   강조 / 흐림 / 선택 · 내 관심사 / 인접 관심사 · 선 3종
 *
 * 세부 값(간격, 크기)은 문서로 확정하지 않고 써 보고 조정한다(D-34).
 */

/** Category별 색 계열. 같은 Category는 같은 계열로 묶는다. */
const CATEGORY_PALETTE = [
  '#1c7ed6', // 개발
  '#7048e8', // 커리어
  '#0ca678', // 학습
  '#2f9e44', // 스포츠
  '#e8590c', // 문화
  '#6741d9', // 게임
  '#c2255c', // 라이프
  '#495057', // 기타
];

const categoryColors = new Map<string, string>();

export function colorForCategory(categoryId: string): string {
  if (!categoryColors.has(categoryId)) {
    categoryColors.set(
      categoryId,
      CATEGORY_PALETTE[categoryColors.size % CATEGORY_PALETTE.length],
    );
  }
  return categoryColors.get(categoryId)!;
}

export function registerCategories(ids: string[]): void {
  for (const id of ids) colorForCategory(id);
}

export const ME_COLOR = '#e03131';
export const PERSON_COLOR = '#495057';

/** 관심사는 사람보다 크고 이름이 항상 보인다(FR-2.2). */
export function radiusOf(node: GraphNode): number {
  if (node.kind === 'ME') return 9;
  if (node.kind === 'PERSON') return 5;
  if (node.kind === 'NETWORK_HUB') return 12;
  return 8 + Math.min(6, Math.sqrt((node as GraphInterestNode).holderCount) / 2);
}

export function colorOf(node: GraphNode): string {
  if (node.kind === 'ME') return ME_COLOR;
  if (node.kind === 'PERSON') return PERSON_COLOR;
  if (node.kind === 'NETWORK_HUB') return '#f08c00';
  return colorForCategory((node as GraphInterestNode).categoryId);
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
    default:
      return null;
  }
}

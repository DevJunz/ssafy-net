import type {
  DisplayNameType,
  InterestRef,
  PublicUser,
  RelationStatus,
} from './types';

/**
 * 그래프 응답 (design/22 §5).
 *
 * 노드 4종과 선 3종만 존재한다(docs/06 §2 시각 부호화).
 * 점수·유사도 필드는 없다(D-51). 좌표도 없다 — 배치는 클라이언트의
 * 힘 기반 레이아웃이 정하고 저장하지 않는다(docs/07 §2.15).
 */
export type GraphNodeKind = 'ME' | 'PERSON' | 'INTEREST' | 'NETWORK_HUB';

export interface GraphPersonNode {
  id: string;
  kind: 'ME' | 'PERSON';
  displayName: string;
  displayNameType: DisplayNameType;
  commonCount: number;
  relation: RelationStatus;
}

export interface GraphInterestNode {
  id: string;
  kind: 'INTEREST';
  name: string;
  categoryId: string;
  /** 내가 고른 관심사인지. 인접 관심사와 구분되어야 한다(docs/06 §2) */
  mine: boolean;
  holderCount: number;
  /** 계층 3의 인접 관심사 — 내가 갖지 않았지만 표시된 사람들이 가진 것 */
  adjacent?: boolean;
  /** 인접 관심사가 왜 나타났는지 설명한다(docs/13 §5) */
  holdersInGraph?: number;
}

export interface GraphHubNode {
  id: string;
  kind: 'NETWORK_HUB';
  commonInterestIds: string[];
  memberCount: number;
}

export type GraphNode = GraphPersonNode | GraphInterestNode | GraphHubNode;

export interface GraphLink {
  source: string;
  target: string;
  kind: 'HAS_INTEREST' | 'SIMILARITY' | 'HUB_MEMBER';
  /** SIMILARITY에만. 선 위 숫자 배지가 된다(FR-8.1) */
  commonCount?: number;
  /** SIMILARITY에만. hover에 이름을 전부 보여준다(FR-8.2, 원칙 3) */
  commonInterestIds?: string[];
}

export type GraphAnchor =
  | { type: 'ME' }
  | { type: 'INTEREST'; interestId: string; name: string };

export interface GraphResponse {
  anchor: GraphAnchor;
  nodes: GraphNode[];
  links: GraphLink[];
  /** 상한으로 잘린 수. 항상 응답에 있다 — 사용자는 그래프가 전부가 아님을 안다 */
  truncated: { people: number; interests: number };
}

export interface SimilarPersonItem {
  user: PublicUser;
  /** 개수만이 아니라 이름을 전부 준다(docs/13 원칙 3) */
  commonInterests: InterestRef[];
  commonCount: number;
  /** 그래프에 선이 그어진 상위 [P-15]명인지 */
  inGraph: boolean;
}

export interface SimilarPeopleResponse {
  criterion: {
    minCommon: number;
    /** 정렬 기준을 서버가 문장으로 준다(원칙 4). 화면 상단에 그대로 쓴다 */
    sortBy: string;
  };
  total: number;
  items: SimilarPersonItem[];
  /** 내가 거절해 숨긴 사람 수 (docs/13 §3.4) */
  hiddenCount: number;
}

export interface InterestPersonItem {
  user: PublicUser;
  commonCount: number;
}

export interface InterestDetail {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  holderCount: number;
  mine: boolean;
  /** 그 관심사를 가진 사람만 글을 쓸 수 있다(FR-6.1) */
  canPost: boolean;
  peopleTotal: number;
  people: InterestPersonItem[];
}

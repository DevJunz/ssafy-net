/**
 * API 응답 타입. design/22 §2의 세 가지 사용자 표현을 그대로 옮긴다.
 *
 * realName 키의 존재 자체가 권한이다. 연결 전 응답에는 이 키가 없다(null도 아니다).
 */

export type DisplayNameType = 'NICKNAME' | 'REAL';

/** design/22 §7. REJECTED는 이 목록에 없다 — 거절은 보낸 사람에게 노출되지 않는다. */
export type RelationStatus =
  | 'NONE'
  | 'REQUEST_SENT'
  | 'REQUEST_RECEIVED'
  | 'CONNECTED'
  | 'NO_RESPONSE'
  | 'SELF';

export interface Relation {
  status: RelationStatus;
  requestId: string | null;
  /** NO_RESPONSE일 때만 채워진다 (P-07). */
  reRequestableAt: string | null;
}

export interface InterestRef {
  id: string;
  name: string;
  categoryId: string;
  /** 조회하는 사람 기준 공통 여부. */
  isCommon?: boolean;
}

export interface PostSummary {
  id: string;
  interestId: string;
  interestName: string;
  content: string;
  createdAt: string;
  /** 관심사 상세의 글 목록에만 있다. 글의 유일한 출구가 작성자 프로필이다(D-46) */
  authorId?: string;
  authorDisplayName?: string;
}

/** 연결 전 모든 조회의 기본형. */
export interface PublicUser {
  id: string;
  displayName: string;
  displayNameType: DisplayNameType;
  interests: InterestRef[];
  commonCount: number;
  relation: Relation;
  recentPosts?: PostSummary[];
  withdrawn?: boolean;
}

/** 연결됨 상태의 상대, 성립 Network 참여 멤버, 나 자신에게만. */
export interface ConnectedUser extends PublicUser {
  realName: string;
}

/** 나에게만. */
export interface SelfUser extends ConnectedUser {
  email: string | null;
  isOperator: boolean;
  status: 'ONBOARDING' | 'ACTIVE' | 'WITHDRAWN';
  requestSuspended: boolean;
}

export type OnboardingStep =
  /** Mattermost 계정 인증. 소속 검증과 알림 채널 확보를 겸한다(D-66) */
  | 'MATTERMOST'
  | 'DISPLAY_NAME'
  | 'INTERESTS'
  | 'DONE';

export interface OnboardingState {
  step: OnboardingStep;
  realNamePreview: string | null;
  /** 인증된 Mattermost 아이디. 인증 전에는 null */
  mattermostUsername: string | null;
  /** 코드를 보냈고 입력을 기다리는 중인지 */
  codeSent: boolean;
}

export interface InterestListItem {
  id: string;
  name: string;
  /** 검색이 별칭에도 걸리게 한다("리액트" → React). */
  aliases: string[];
  holderCount: number;
  mine: boolean;
  status: 'ACTIVE' | 'HIDDEN' | 'MERGED';
}

/** ATTRIBUTE는 분류당 하나만 고르고 개수·공통 계산에서 빠진다(D-72). */
export type CategoryKind = 'INTEREST' | 'ATTRIBUTE';

export interface InterestCategory {
  id: string;
  name: string;
  kind: CategoryKind;
  interests: InterestListItem[];
}

export interface InterestCatalog {
  categories: InterestCategory[];
  /** INTEREST 분류만 센다. 속성은 포함하지 않는다. */
  selectedCount: number;
  min: number;
  max: number;
}

/** 관심사 추가 전 중복 검사 결과 한 건 (D-74). */
export interface SimilarInterest {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  holderCount: number;
  /** EXACT면 같은 뜻으로 보고 추가를 막는다. SIMILAR면 확인을 받는다. */
  match: 'EXACT' | 'SIMILAR';
}

/** POST /interests 응답. 만든 사람의 선택에는 아직 들어가지 않는다 — 화면이 고른 뒤 저장한다. */
export interface CreatedInterest {
  id: string;
  name: string;
  categoryId: string;
  aliases: string[];
  holderCount: number;
}

export interface ApiError {
  code: string;
  /** 화면에 그대로 쓸 수 있는 한국어 (design/22 §1.2). */
  message: string;
  details?: Record<string, unknown>;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

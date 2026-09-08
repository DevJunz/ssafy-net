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
  | 'IDENTITY'
  | 'DISPLAY_NAME'
  | 'INTERESTS'
  | 'NOTIFICATIONS'
  | 'DONE';

export interface OnboardingState {
  step: OnboardingStep;
  realNamePreview: string | null;
}

export interface InterestListItem {
  id: string;
  name: string;
  holderCount: number;
  mine: boolean;
  status: 'ACTIVE' | 'HIDDEN' | 'MERGED';
}

export interface InterestCategory {
  id: string;
  name: string;
  interests: InterestListItem[];
}

export interface InterestCatalog {
  categories: InterestCategory[];
  selectedCount: number;
  min: number;
  max: number;
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

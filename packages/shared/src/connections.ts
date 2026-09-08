import type { ConnectedUser, InterestRef, PublicUser } from './types';

/**
 * 연결 (docs/09).
 *
 * Connection은 "두 사람이 관심사를 바탕으로 이야기해볼 의사를 서로 확인했다"는
 * 상태다. 친구가 아니고, 지속 관계도 아니다(D-39). 그래서 해제가 없고(D-42),
 * 연결 수를 남에게 보여주지 않는다(docs/12 §5).
 */

export interface RequestQuota {
  dailyLimit: number;
  dailyUsed: number;
  weeklyLimit: number;
  weeklyUsed: number;
  /** 수락률이 낮아 일일 상한이 낮춰진 상태인지(docs/09 §3) */
  throttled: boolean;
  resetAt: string;
}

/** 보낸 사람이 보는 상태. REJECTED는 여기 없다 — 거절은 노출되지 않는다(D-07). */
export type SentRequestStatus =
  | 'PENDING'
  | 'NO_RESPONSE'
  | 'CANCELLED'
  | 'ACCEPTED';

export interface ReceivedRequestSummary {
  id: string;
  from: PublicUser;
  commonInterests: InterestRef[];
  commonCount: number;
  /** 메시지 첫 줄. 목록에서 판단을 돕는다(docs/06 §3.7) */
  messagePreview: string;
  expiresAt: string;
  daysLeft: number;
}

export interface RequestDetail {
  id: string;
  from: PublicUser;
  commonInterests: InterestRef[];
  message: string;
  createdAt: string;
  expiresAt: string;
  daysLeft: number;
  /** 닉네임 사용자만 수락 전 확인을 거친다(docs/07 §3.3) */
  revealsMyRealName: boolean;
  myRealName: string;
}

export interface SentRequestSummary {
  id: string;
  to: PublicUser;
  createdAt: string;
  status: SentRequestStatus;
  reRequestableAt: string | null;
  canCancel: boolean;
}

export interface ConnectionSummary {
  id: string;
  /** 연결됨 상태이므로 실명이 들어온다(docs/12 §1) */
  counterpart: ConnectedUser;
  commonInterests: InterestRef[];
  establishedAt: string;
  myRole: 'INITIATOR' | 'COUNTERPART';
  started: boolean;
}

export interface ConnectionAction {
  /** "○○님, 사내 메신저에서 △△님을 찾아 첫 메시지를 보내주세요" (FR-11.3) */
  text: string;
  /** 메신저에서 찾을 실명. 복사 버튼에 쓴다 */
  copyText: string;
  buttonLabel: string;
}

export interface ConnectionDetail extends ConnectionSummary {
  requestMessage: string | null;
  action: ConnectionAction;
}

export interface FollowUpItem {
  id: string;
  subjectType: 'CONNECTION' | 'NETWORK';
  subjectId: string;
  /** "김지수님과 대화를 시작하셨나요?" */
  question: string;
  counterpartName: string;
}

export const FOLLOW_UP_REASONS = [
  { value: 'NOT_FOUND', label: '메신저에서 찾지 못함' },
  { value: 'NO_TIME', label: '아직 시간이 없었음' },
  { value: 'BURDEN', label: '막상 부담스러움' },
  { value: 'OTHER', label: '기타' },
] as const;

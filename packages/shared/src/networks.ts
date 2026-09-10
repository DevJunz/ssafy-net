import type { ConnectedUser, InterestRef, PublicUser } from './types';

/**
 * Network (docs/10). Should Have — 데이터 게이트를 통과해야 노출된다(§4).
 *
 * 1:1이 "이 사람과 이야기하고 싶다"라면 Network는 "이 주제들로 모임을 만들고 싶다"에
 * 가깝다. 공통 관심사는 **멤버 전원의 교집합**이다. Pairwise가 아니다 —
 * 교집합이어야 "이 N명은 이 K개를 모두 공유합니다" 한 문장으로 설명이 끝난다.
 */

export type NetworkStatus = 'OPEN' | 'ACTIVATED' | 'EXPIRED' | 'DISSOLVED';
export type NetworkDecision = 'PENDING' | 'JOINED' | 'DECLINED';

export interface NetworkMemberView {
  /** 성립 전에는 표시명만, 성립 후 참여자에게는 실명까지(docs/12 §6) */
  user: PublicUser | ConnectedUser;
  decision: NetworkDecision;
  joinOrder: number | null;
  isMe: boolean;
}

export interface NetworkSummary {
  id: string;
  /** "이 4명은 관심사 5개를 모두 공유합니다" — 서버가 완성해 준다(docs/13 §4) */
  reason: string;
  commonInterests: InterestRef[];
  size: number;
  joinedCount: number;
  requiredCount: number;
  status: NetworkStatus;
  myDecision: NetworkDecision;
  expiresAt: string;
  daysLeft: number;
}

/**
 * 성립된 네트워크의 대화 재료(D-87). 공유 관심사마다 고정된 질문과, 성립 때 뽑아 고정한
 * 포괄 아이스브레이킹 질문 2개. 참여자에게만 준다.
 */
export interface NetworkQuestions {
  byInterest: { interestId: string; interestName: string; questions: string[] }[];
  icebreakers: string[];
}

export interface NetworkDetail extends NetworkSummary {
  members: NetworkMemberView[];
  /** 지금 참여하면 시작자가 되는지. 참여 전 안내에 쓴다(docs/07 §4.1) */
  wouldBeInitiator: boolean;
  initiatorName: string | null;
  /** 성립 후에만 채워진다 */
  action: {
    text: string;
    copyText: string;
    buttonLabel: string;
  } | null;
  started: boolean;
  /** 노출 시점 기준임을 카드에 작게 표시한다(docs/10 §2a) */
  snapshotNote: string;
  /** 성립 후 참여자에게만. 그 전에는 null */
  questions: NetworkQuestions | null;
}

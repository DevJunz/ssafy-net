/**
 * 운영자 레버 — 관심사와 그 분류, 네트워킹 질문 (D-86, D-87, D-88).
 *
 * `GET/POST/PATCH/DELETE /api/admin/categories`, `/api/admin/interests`, `/api/admin/questions/...`.
 * 응답에 사용자는 없다. 실명이 새어 나갈 자리가 아예 없다(design/20 §11) —
 * 관심사를 누가 만들었는지도 이름 대신 `userAdded` 한 칸으로만 알린다.
 */
import type { CategoryKind, InterestStatus } from './types';

/** 관심사 분류 한 줄. 화면에서 이름을 고치고 순서를 바꾸고, 비어 있으면 지운다. */
export interface AdminCategory {
  id: string;
  name: string;
  kind: CategoryKind;
  sortOrder: number;
  /** 이 분류에 속한 관심사 수(숨김·병합 포함). 0이어야 지울 수 있다 */
  interestCount: number;
}

/**
 * 관심사 한 줄 (D-88). 운영 화면에서 이름·별칭·분류·순서를 고치고, 숨기고, 아무도 안 가졌으면 지운다.
 *
 * 숫자 셋은 "지워도 되는가"를 판단하는 재료다 — 사람이 있으면 지울 수 없고,
 * 글과 질문은 지우면 같이 사라진다.
 */
export interface AdminInterest {
  id: string;
  name: string;
  /** 중복 검사에 쓰는 다른 표기("리액트", "reactjs"). 검색에도 걸린다(D-74) */
  aliases: string[];
  categoryId: string;
  categoryName: string;
  categoryKind: CategoryKind;
  status: InterestStatus;
  /** 지금 이 관심사를 고르고 있는 사람 수. 비정규화 값이 아니라 실제로 센 것이다 */
  holderCount: number;
  /** 지워지지 않은 글 수. 관심사를 지우면 같이 사라진다 */
  postCount: number;
  /** 이 관심사에 달린 주제별 질문 수(D-87). 관심사를 지우면 같이 사라진다 */
  questionCount: number;
  sortOrder: number;
  /** 사용자가 직접 만든 것인지(D-74). 누가 만들었는지는 내보내지 않는다 */
  userAdded: boolean;
}

/** 주제별 질문 요약 — 관심사마다 질문이 몇 개 있는지. 목록 화면용 */
export interface AdminInterestQuestionSummary {
  interestId: string;
  interestName: string;
  categoryName: string;
  holderCount: number;
  questionCount: number;
}

/** 질문 한 줄. 주제별 질문과 포괄 아이스브레이킹이 같은 모양을 쓴다 */
export interface AdminQuestion {
  id: string;
  text: string;
  sortOrder: number;
  /** 포괄 질문에만. 끄면 새로 성립하는 네트워크에 뽑히지 않는다 */
  active?: boolean;
}

export const PROFILE_MESSAGE_MAX = 120;
export const QUESTION_TEXT_MAX = 200;
export const CATEGORY_NAME_MAX = 20;

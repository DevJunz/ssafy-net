/**
 * 운영자 레버 — 관심사 분류와 네트워킹 질문 (D-86, D-87).
 *
 * `GET/POST/PATCH/DELETE /api/admin/categories`, `/api/admin/questions/...`.
 * 응답에 사용자는 없다. 실명이 새어 나갈 자리가 아예 없다(design/20 §11).
 */
import type { CategoryKind } from './types';

/** 관심사 분류 한 줄. 화면에서 이름을 고치고 순서를 바꾸고, 비어 있으면 지운다. */
export interface AdminCategory {
  id: string;
  name: string;
  kind: CategoryKind;
  sortOrder: number;
  /** 이 분류에 속한 관심사 수(숨김·병합 포함). 0이어야 지울 수 있다 */
  interestCount: number;
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

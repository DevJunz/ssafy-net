/**
 * 캠퍼스 구조 (docs/16 D-73). 단일 캠퍼스 전제(D-17)라 상수로 둔다.
 * 반은 실명 표기("최준환_서울_18반")의 일부이고, 층은 관심사 목록의 속성 분류로 고른다(D-72).
 */
export const CAMPUS = '서울';
export const CLASS_COUNT = 22;
export const FLOOR_COUNT = 20;

export const CLASS_OPTIONS = Array.from({ length: CLASS_COUNT }, (_, i) => `${i + 1}반`);
export const FLOOR_OPTIONS = Array.from({ length: FLOOR_COUNT }, (_, i) => `${i + 1}층`);

/** 속성 분류의 이름. 시드와 화면이 같은 값을 쓴다. */
export const FLOOR_CATEGORY = '층';

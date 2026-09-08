/**
 * 관심사 이름 유사도 (D-74).
 *
 * 사용자가 관심사를 직접 추가할 수 있게 되면서 "백엔드/백앤드/Backend"처럼 같은 뜻이
 * 흩어질 위험이 생겼다(docs/08 §1이 자유 입력을 막았던 이유). 추가 전에 이 판정으로
 * 같은 것은 막고, 비슷한 것은 보여준 뒤 확인을 받는다.
 *
 * 세 단계로 본다.
 *   1. 정규화 후 완전 일치 (이름 또는 별칭) → EXACT. 공백·기호·대소문자를 무시한다.
 *   2. 포함 관계 ("스프링부트" ⊃ "스프링", "reactjs" ⊃ "react") → SIMILAR
 *   3. 자모 단위 bigram Dice 계수 / 편집 거리 → SIMILAR.
 *      한글은 음절이 아니라 자모로 풀어야 "리엑트"와 "리액트"(모음 하나 차이)가 가깝게 나온다.
 *
 * 외부 라이브러리 없이 100~200개 후보를 매번 훑는다. 그 규모에서는 이것으로 충분하다.
 */

export interface SimilarityCandidate {
  id: string;
  name: string;
  aliases: string[];
}

export interface SimilarityHit<T extends SimilarityCandidate> {
  candidate: T;
  match: 'EXACT' | 'SIMILAR';
  score: number;
  /** 무엇에 걸렸는지. 화면에 "‘리액트’는 React의 다른 표기입니다"라고 쓸 수 있다. */
  matchedText: string;
}

/** 0.60이면 "러스트"가 "테스트"에 걸린다. "리엑트"→"리액트"(0.67)는 남기고 그 아래를 자른다. */
const SIMILAR_DICE = 0.62;

/** 비교용 정규화: NFKC → 소문자 → 한글·영문·숫자·(+, #)만 남긴다. */
export function normalizeInterestName(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-z0-9+#]/g, '');
}

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';

/** 한글 음절을 초성·중성·종성으로 푼다. 나머지 문자는 그대로 둔다. */
export function toJamo(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) {
      out += ch;
      continue;
    }
    const index = code - 0xac00;
    const cho = Math.floor(index / 588);
    const jung = Math.floor((index % 588) / 28);
    const jong = index % 28;
    out += CHO[cho] + JUNG[jung] + (jong ? JONG[jong] : '');
  }
  return out;
}

function bigrams(text: string): Map<string, number> {
  const map = new Map<string, number>();
  if (text.length < 2) {
    if (text.length === 1) map.set(text, 1);
    return map;
  }
  for (let i = 0; i < text.length - 1; i += 1) {
    const gram = text.slice(i, i + 2);
    map.set(gram, (map.get(gram) ?? 0) + 1);
  }
  return map;
}

/** Sørensen–Dice. 0(무관)~1(같음). */
export function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let overlap = 0;
  for (const [gram, count] of ga) {
    overlap += Math.min(count, gb.get(gram) ?? 0);
  }
  let total = 0;
  for (const count of ga.values()) total += count;
  for (const count of gb.values()) total += count;
  return total === 0 ? 0 : (2 * overlap) / total;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/** 이름 하나와 입력을 비교한다. 0이면 무관. */
function scoreOne(query: string, text: string): number {
  const nq = normalizeInterestName(query);
  const nt = normalizeInterestName(text);
  if (!nq || !nt) return 0;
  if (nq === nt) return 1;

  // 포함 관계. 한 글자짜리("뷰" ⊂ "인터뷰")는 오탐이 많아 두 글자부터 본다.
  if (nq.length >= 2 && nt.length >= 2 && (nt.includes(nq) || nq.includes(nt))) {
    return 0.9;
  }

  const jq = toJamo(nq);
  const jt = toJamo(nt);
  const dice = diceCoefficient(jq, jt);
  if (dice >= SIMILAR_DICE) return dice;

  // 짧은 이름은 bigram이 몇 개 없어 Dice가 거칠다. 편집 거리로 보완한다.
  const distance = levenshtein(jq, jt);
  const shorter = Math.min(jq.length, jt.length);
  if (shorter >= 3 && distance <= 1) return 0.75;
  if (shorter >= 6 && distance <= 2) return 0.65;

  return 0;
}

/**
 * 후보 전체를 훑어 걸리는 것만 점수 순으로 돌려준다.
 * 이름과 별칭 중 가장 높은 점수를 그 후보의 점수로 한다.
 */
export function findSimilarInterests<T extends SimilarityCandidate>(
  query: string,
  candidates: T[],
  limit = 5,
): SimilarityHit<T>[] {
  const hits: SimilarityHit<T>[] = [];

  for (const candidate of candidates) {
    let best = 0;
    let matchedText = candidate.name;
    for (const text of [candidate.name, ...candidate.aliases]) {
      const score = scoreOne(query, text);
      if (score > best) {
        best = score;
        matchedText = text;
      }
      if (best === 1) break;
    }
    if (best > 0) {
      hits.push({
        candidate,
        match: best === 1 ? 'EXACT' : 'SIMILAR',
        score: best,
        matchedText,
      });
    }
  }

  // 같은 뜻이 있으면 그것만 보여준다. "백앤드" 옆에 "악기 연주(밴드)"가 나오면 헷갈린다.
  const exact = hits.filter((hit) => hit.match === 'EXACT');
  const chosen = exact.length > 0 ? exact : hits;
  return chosen.sort((x, y) => y.score - x.score).slice(0, limit);
}

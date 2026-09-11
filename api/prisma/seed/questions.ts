/**
 * 주제별 질문의 틀 문장 (D-87).
 *
 * 진짜 질문과 포괄 아이스브레이킹 질문은 `prisma/content.json` 에 있다(seed/content.ts 가 읽는다).
 * 여기 남은 것은 **파일에 없는 관심사**를 위한 틀이다 — 사용자가 직접 추가한 관심사(D-74)처럼
 * 질문이 하나도 없는 것에만 들어간다. 운영자가 /ops 에서 고친 것은 덮지 않는다.
 */

/**
 * 관심사 이름으로 질문 세 줄을 만든다.
 * 한글 받침에 맞춰 을/를·과/와를 고른다. 영문으로 끝나면 둘 다 적는다.
 */
export function templateQuestionsFor(name: string): string[] {
  const last = name[name.length - 1] ?? '';
  const code = last.charCodeAt(0);
  const hangul = code >= 0xac00 && code <= 0xd7a3;
  const batchim = hangul ? (code - 0xac00) % 28 !== 0 : null;
  const eulReul = batchim === null ? '을(를)' : batchim ? '을' : '를';
  const gwaWa = batchim === null ? '과(와)' : batchim ? '과' : '와';
  return [
    `${name}${eulReul} 어떻게 시작하게 되셨나요?`,
    `요즘 ${name}에서 가장 관심 있는 주제나 고민은 무엇인가요?`,
    `${name}${gwaWa} 관련해 추천하고 싶은 자료나 경험이 있다면요?`,
  ];
}

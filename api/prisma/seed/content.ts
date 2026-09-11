/**
 * 운영용 내용 한 벌 — `prisma/content.json` 을 읽는다.
 *
 * 시드(`prisma:seed`)와 통째 교체(`content:import`)가 **같은 파일**을 본다.
 * 관심사 목록을 두 군데에 적어 두면 한쪽만 고쳐져 어긋난다 — 그래서 시드도 이 파일을 읽는다.
 *
 * 둘의 차이는 쓰는 방식뿐이다.
 *   - 시드   — upsert. 이미 있는 것은 그대로 두고 없는 것만 채운다. 언제 돌려도 안전하다
 *   - 임포트 — 비우고 다시 넣는다. 파일에 없는 관심사와 그 선택·글이 사라진다
 *
 * 파일 형태의 기준은 `prisma/content-import.ts` 의 zod 스키마다. 여기서는 시드가 쓰는
 * 만큼만 확인한다 — 형태가 깨졌으면 시드를 돌리기 전에 임포터의 `--dry-run` 이 잡아준다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface ContentInterest {
  name: string;
  aliases: string[];
  questions: string[];
}

export interface ContentCategory {
  name: string;
  kind: 'INTEREST' | 'ATTRIBUTE';
  interests: ContentInterest[];
}

export interface Content {
  categories: ContentCategory[];
  icebreakers: string[];
}

const FILE = resolve(__dirname, '..', 'content.json');

function load(): Content {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(FILE, 'utf8'));
  } catch (error) {
    throw new Error(
      `운영용 내용 파일을 읽지 못했다: ${FILE}\n` +
        `시드는 이 파일을 원본으로 쓴다. prisma/content.example.json 을 참고해 만든다.\n` +
        String(error),
    );
  }

  const data = raw as Partial<Content>;
  if (!Array.isArray(data.categories) || data.categories.length === 0) {
    throw new Error(`${FILE} 에 categories 가 없다.`);
  }

  return {
    categories: data.categories.map((category) => ({
      name: category.name,
      kind: category.kind === 'ATTRIBUTE' ? 'ATTRIBUTE' : 'INTEREST',
      interests: (category.interests ?? []).map((interest) => ({
        name: interest.name,
        aliases: interest.aliases ?? [],
        questions: interest.questions ?? [],
      })),
    })),
    icebreakers: data.icebreakers ?? [],
  };
}

export const CONTENT = load();

/** 관심사 이름 → 주제별 질문. 시드가 질문 없는 관심사를 채울 때 쓴다. */
export const QUESTIONS_BY_INTEREST = new Map<string, string[]>(
  CONTENT.categories.flatMap((category) =>
    category.interests.map((interest) => [interest.name, interest.questions] as const),
  ),
);

/**
 * 운영용 내용 넣기 — 분류 · 관심사 · 주제별 질문 · 아이스브레이킹 질문 (D-86 · D-87 · D-88).
 *
 *   npm run content:import -- <파일.json> --dry-run   # 무엇이 바뀌는지만 본다. 아무것도 쓰지 않는다
 *   npm run content:import -- <파일.json>             # 내용을 통째로 갈아 끼운다
 *
 * **덮어쓰기가 아니라 교체다.** 파일에 없는 분류·관심사·질문은 사라진다.
 * 관심사를 지우면 그것을 고른 사람들의 선택과 글, 변경 이력도 함께 사라진다(외래키 cascade).
 * 공개 전 한 번 쓰라고 만든 것이다. 사람이 들어온 뒤에는 `/ops` 관리 탭에서 하나씩 고친다.
 *
 * 지우는 것:  category, interest(+user_interest, interest_post, user_interest_change,
 *             interest_question), icebreaker_question, network_candidate,
 *             network_recommendation(+members)
 * 두는 것:    user, connection_request, notification, app_parameter, invite_code, analytics_event
 *
 * 네트워크 후보와 추천을 함께 비우는 이유는 둘 다 관심사 id 를 **배열로** 들고 있어서다.
 * 배열 컬럼이라 외래키가 없어 관심사를 지워도 조용히 남는다 — 이미 없는 관심사를 가리키는
 * 후보가 그대로 있으면 `/ops` 의 후보 수가 거짓이 되고, 그 상태에서 노출이 돌면 "관심사 5개를
 * 모두 공유합니다" 라고 써 놓고 정작 관심사 칩이 하나도 없는 카드가 만들어진다.
 * 다음 `network.recompute` 배치가 새 관심사로 다시 만든다.
 *
 * 파일 형태는 이 파일 아래 `contentSchema` 가 유일한 기준이다. 예시는 prisma/content.example.json.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const INTEREST_NAME_MAX = 20;
const CATEGORY_NAME_MAX = 20;
const QUESTION_TEXT_MAX = 200;

/** 이름 글자 규칙은 화면·API 와 같다(shared 의 interestNameSchema). */
const nameSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[가-힣a-zA-Z0-9 .+#·/&-]+$/, '한글, 영문, 숫자와 몇 가지 기호만 쓸 수 있습니다');

const questionSchema = z.string().trim().min(1).max(QUESTION_TEXT_MAX);

const contentSchema = z.object({
  categories: z
    .array(
      z.object({
        name: nameSchema.max(CATEGORY_NAME_MAX),
        /** 생략하면 이야깃거리. 층처럼 분류당 하나만 고르는 것만 ATTRIBUTE (D-72) */
        kind: z.enum(['INTEREST', 'ATTRIBUTE']).default('INTEREST'),
        interests: z
          .array(
            z.object({
              name: nameSchema.max(INTEREST_NAME_MAX),
              aliases: z.array(nameSchema.max(INTEREST_NAME_MAX)).max(10).default([]),
              questions: z.array(questionSchema).default([]),
            }),
          )
          .default([]),
      }),
    )
    .min(1),
  icebreakers: z.array(questionSchema).default([]),
});

type Content = z.infer<typeof contentSchema>;

const prisma = new PrismaClient();

function parseArgs(): { file: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const file = args.find((arg) => !arg.startsWith('-'));
  if (!file) {
    console.error(
      '파일을 지정한다:  npm run content:import -- prisma/content.json [--dry-run]',
    );
    process.exit(1);
  }
  return { file: resolve(file), dryRun };
}

/** 같은 이름이 두 번 나오면 넣기 전에 멈춘다. interest.name 은 unique 라 넣다가 터지면 절반만 들어간다. */
function assertNoDuplicates(content: Content): void {
  const categories = new Set<string>();
  const interests = new Map<string, string>();
  const problems: string[] = [];

  for (const category of content.categories) {
    if (categories.has(category.name)) problems.push(`분류 이름 중복: ${category.name}`);
    categories.add(category.name);

    for (const interest of category.interests) {
      const seen = interests.get(interest.name);
      if (seen) {
        problems.push(`관심사 이름 중복: ${interest.name} (${seen}, ${category.name})`);
      }
      interests.set(interest.name, category.name);

      const aliases = new Set<string>();
      for (const alias of interest.aliases) {
        if (aliases.has(alias)) problems.push(`별칭 중복: ${interest.name} 의 ${alias}`);
        aliases.add(alias);
      }
    }
  }

  const icebreakers = new Set<string>();
  for (const question of content.icebreakers) {
    if (icebreakers.has(question)) problems.push(`아이스브레이킹 질문 중복: ${question}`);
    icebreakers.add(question);
  }

  if (problems.length) {
    console.error('\n파일에 문제가 있다. 아무것도 넣지 않았다:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const { file, dryRun } = parseArgs();

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`파일을 읽지 못했다: ${file}\n${String(error)}`);
    process.exit(1);
  }

  const parsed = contentSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('\n파일 형태가 맞지 않다. 아무것도 넣지 않았다:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    process.exit(1);
  }
  const content = parsed.data;
  assertNoDuplicates(content);

  const interestCount = content.categories.reduce((sum, c) => sum + c.interests.length, 0);
  const questionCount = content.categories.reduce(
    (sum, c) => sum + c.interests.reduce((inner, i) => inner + i.questions.length, 0),
    0,
  );

  // 지금 DB 에 무엇이 있는지 — 사라지는 것을 눈으로 보고 결정하라고 먼저 보여준다.
  const [
    nowCategories,
    nowInterests,
    nowQuestions,
    nowIcebreakers,
    nowSelections,
    nowPosts,
    nowNetworks,
    nowCandidates,
  ] = await Promise.all([
    prisma.category.count(),
    prisma.interest.count(),
    prisma.interestQuestion.count(),
    prisma.icebreakerQuestion.count(),
    prisma.userInterest.count(),
    prisma.interestPost.count(),
    prisma.networkRecommendation.count(),
    prisma.networkCandidate.count(),
  ]);

  const held = await prisma.interest.findMany({
    where: { users: { some: {} } },
    select: { name: true, _count: { select: { users: true } } },
    orderBy: { holderCount: 'desc' },
  });
  const keptNames = new Set(
    content.categories.flatMap((c) => c.interests.map((i) => i.name)),
  );
  const losing = held.filter((row) => !keptNames.has(row.name));

  console.log(`\n파일: ${file}`);
  console.log('넣을 것');
  console.log(`  분류 ${content.categories.length}개`);
  console.log(`  관심사 ${interestCount}개`);
  console.log(`  주제별 질문 ${questionCount}개`);
  console.log(`  아이스브레이킹 질문 ${content.icebreakers.length}개`);
  console.log('\n지금 DB (전부 지우고 위 내용으로 바꾼다)');
  console.log(`  분류 ${nowCategories}개 · 관심사 ${nowInterests}개`);
  console.log(`  주제별 질문 ${nowQuestions}개 · 아이스브레이킹 ${nowIcebreakers}개`);
  console.log(`  사람들의 관심사 선택 ${nowSelections}건 · 글 ${nowPosts}개`);
  console.log(`  네트워크 추천 ${nowNetworks}건 · 후보 ${nowCandidates}개`);

  if (losing.length) {
    console.log('\n사라지는 선택 (파일에 없는데 지금 누가 고르고 있는 관심사)');
    for (const row of losing.slice(0, 20)) {
      console.log(`  - ${row.name} · ${row._count.users}명`);
    }
    if (losing.length > 20) console.log(`  … 외 ${losing.length - 20}개`);
  }

  if (dryRun) {
    console.log('\n--dry-run 이라 아무것도 쓰지 않았다.');
    return;
  }

  // 한 트랜잭션 안에서 비우고 채운다. 중간에 실패하면 통째로 되돌아간다.
  await prisma.$transaction(
    async (tx) => {
      await tx.networkMember.deleteMany();
      await tx.networkRecommendation.deleteMany();
      // 배열 컬럼이라 cascade 가 없다. 여기서 지우지 않으면 없는 관심사를 가리키는 후보가 남는다.
      await tx.networkCandidate.deleteMany();
      await tx.icebreakerQuestion.deleteMany();
      // interest 를 지우면 interest_question · user_interest · interest_post ·
      // user_interest_change 가 cascade 로 따라 지워진다(schema.prisma).
      await tx.interest.deleteMany();
      await tx.category.deleteMany();

      for (const [categoryIndex, category] of content.categories.entries()) {
        const created = await tx.category.create({
          data: { name: category.name, kind: category.kind, sortOrder: categoryIndex },
        });

        for (const [interestIndex, interest] of category.interests.entries()) {
          const madeInterest = await tx.interest.create({
            data: {
              name: interest.name,
              categoryId: created.id,
              aliases: interest.aliases,
              sortOrder: interestIndex,
              // 파일로 넣은 것은 운영자의 목록이다. 사용자가 만든 것(D-74)이 아니다.
              createdById: null,
            },
          });

          if (interest.questions.length) {
            await tx.interestQuestion.createMany({
              data: interest.questions.map((text, index) => ({
                interestId: madeInterest.id,
                text,
                sortOrder: index,
              })),
            });
          }
        }
      }

      if (content.icebreakers.length) {
        await tx.icebreakerQuestion.createMany({
          data: content.icebreakers.map((text, index) => ({ text, sortOrder: index, active: true })),
        });
      }
    },
    // 관심사가 많으면 기본 5초를 넘긴다.
    { timeout: 120_000 },
  );

  console.log('\n넣었다.');
  console.log(
    `  분류 ${content.categories.length} · 관심사 ${interestCount} · 주제별 질문 ${questionCount} · 아이스브레이킹 ${content.icebreakers.length}`,
  );
  console.log(
    '\n사람들의 관심사 선택은 비었다. 이미 가입한 사람은 프로필에서 관심사를 다시 고른다.',
  );
  console.log('네트워크 추천은 다음 network.recompute 배치가 새 관심사로 다시 만든다.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });

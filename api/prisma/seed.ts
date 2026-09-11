import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  FEATURE_FLAGS,
  PARAMETER_DEFS,
  PARAMETER_KEYS,
} from '@ssafy-net/shared';
import { CONTENT, QUESTIONS_BY_INTEREST } from './seed/content';
import { templateQuestionsFor } from './seed/questions';

const prisma = new PrismaClient();

async function seedParameters() {
  for (const key of PARAMETER_KEYS) {
    const def = PARAMETER_DEFS[key];
    await prisma.appParameter.upsert({
      where: { key },
      // 이미 운영자가 조정한 값은 덮어쓰지 않는다. 라벨만 최신으로 맞춘다.
      update: { label: def.label },
      create: { key, value: def.value, label: def.label },
    });
  }
  console.log(`파라미터 ${PARAMETER_KEYS.length}개 확인`);
}

async function seedFeatureFlags() {
  for (const [key, def] of Object.entries(FEATURE_FLAGS)) {
    await prisma.featureFlag.upsert({
      where: { key },
      update: { note: def.note },
      create: { key, enabled: def.enabled, note: def.note },
    });
  }
  console.log(`기능 플래그 ${Object.keys(FEATURE_FLAGS).length}개 확인`);
}

async function seedInterests() {
  let categoryOrder = 0;
  let total = 0;

  let attributes = 0;

  for (const group of CONTENT.categories) {
    const category = await prisma.category.upsert({
      where: { name: group.name },
      update: { sortOrder: categoryOrder, kind: group.kind },
      create: { name: group.name, sortOrder: categoryOrder, kind: group.kind },
    });
    categoryOrder += 1;

    let interestOrder = 0;
    for (const item of group.interests) {
      await prisma.interest.upsert({
        where: { name: item.name },
        // 이름·별칭·분류는 파일이 원본이다. holderCount와 status는 운영 중 값이라 건드리지 않는다.
        update: { categoryId: category.id, sortOrder: interestOrder, aliases: item.aliases },
        create: {
          name: item.name,
          categoryId: category.id,
          sortOrder: interestOrder,
          aliases: item.aliases,
        },
      });
      interestOrder += 1;
      if (group.kind === 'ATTRIBUTE') attributes += 1;
      else total += 1;
    }
  }

  console.log(
    `관심사 ${total}개 / 분류 ${CONTENT.categories.filter((g) => g.kind === 'INTEREST').length}개, 속성 ${attributes}개 확인`,
  );
}

/** 포괄 아이스브레이킹(D-87). 문장으로 upsert 하므로 운영자가 고친 것은 그대로 남고, 지운 것은 다시 생긴다. */
async function seedIcebreakers() {
  let created = 0;
  for (const [index, text] of CONTENT.icebreakers.entries()) {
    const existing = await prisma.icebreakerQuestion.findUnique({ where: { text } });
    if (existing) continue;
    await prisma.icebreakerQuestion.create({ data: { text, sortOrder: index } });
    created += 1;
  }
  console.log(`포괄 아이스브레이킹 질문 ${CONTENT.icebreakers.length}개 확인 (새로 ${created}개)`);
}

/**
 * 주제별 질문(D-87). 질문이 하나도 없는 이야깃거리 관심사에만 넣는다 —
 * 운영자가 /ops 에서 고친 관심사는 건드리지 않는다.
 * 문장은 content.json 에서 가져오고, 파일에 없는 관심사(사용자가 직접 추가한 것 등)에만 틀을 쓴다.
 */
async function seedInterestQuestions() {
  const interests = await prisma.interest.findMany({
    where: { category: { kind: 'INTEREST' }, questions: { none: {} } },
    select: { id: true, name: true },
  });
  let fromFile = 0;
  let fromTemplate = 0;
  for (const interest of interests) {
    const written = QUESTIONS_BY_INTEREST.get(interest.name) ?? [];
    const texts = written.length ? written : templateQuestionsFor(interest.name);
    if (written.length) fromFile += 1;
    else fromTemplate += 1;
    await prisma.interestQuestion.createMany({
      data: texts.map((text, sortOrder) => ({ interestId: interest.id, text, sortOrder })),
    });
  }
  console.log(
    `주제별 질문: 관심사 ${interests.length}개에 새로 넣음 (파일 ${fromFile}개 · 틀 ${fromTemplate}개)`,
  );
}

async function seedInviteCode() {
  const existing = await prisma.inviteCode.findFirst({ where: { active: true } });
  if (existing) {
    console.log(`초대 코드 있음: ${existing.code}`);
    return;
  }

  const code = randomBytes(8).toString('hex');
  await prisma.inviteCode.create({ data: { code, label: '1차 공유용' } });
  console.log(`초대 코드 생성: ${code}`);
  console.log(`  가입 링크: /invite/${code}`);
  console.log('  (invite_required 플래그가 꺼져 있으면 초대 링크 없이도 가입된다, D-84)');
}

async function main() {
  await seedParameters();
  await seedFeatureFlags();
  await seedInterests();
  await seedIcebreakers();
  await seedInterestQuestions();
  await seedInviteCode();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  FEATURE_FLAGS,
  PARAMETER_DEFS,
  PARAMETER_KEYS,
} from '@ssafy-net/shared';
import { ICEBREAKER_SEED, templateQuestionsFor } from './seed/icebreakers';
import { INTEREST_SEED, seedItemAliases, seedItemName } from './seed/interests';

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

  for (const group of INTEREST_SEED) {
    const kind = group.kind ?? 'INTEREST';
    const category = await prisma.category.upsert({
      where: { name: group.category },
      update: { sortOrder: categoryOrder, kind },
      create: { name: group.category, sortOrder: categoryOrder, kind },
    });
    categoryOrder += 1;

    let interestOrder = 0;
    for (const item of group.interests) {
      const name = seedItemName(item);
      const aliases = seedItemAliases(item);
      await prisma.interest.upsert({
        where: { name },
        // 이름·별칭·분류는 시드가 원본이다. holderCount와 status는 운영 중 값이라 건드리지 않는다.
        update: { categoryId: category.id, sortOrder: interestOrder, aliases },
        create: { name, categoryId: category.id, sortOrder: interestOrder, aliases },
      });
      interestOrder += 1;
      if (kind === 'ATTRIBUTE') attributes += 1;
      else total += 1;
    }
  }

  console.log(
    `관심사 ${total}개 / 분류 ${INTEREST_SEED.filter((g) => (g.kind ?? 'INTEREST') === 'INTEREST').length}개, 속성 ${attributes}개 확인 (D-71)`,
  );
}

/** 포괄 아이스브레이킹(D-87). 문장으로 upsert 하므로 운영자가 고친 것은 그대로 남고, 지운 것은 다시 생긴다. */
async function seedIcebreakers() {
  let created = 0;
  for (const [index, text] of ICEBREAKER_SEED.entries()) {
    const existing = await prisma.icebreakerQuestion.findUnique({ where: { text } });
    if (existing) continue;
    await prisma.icebreakerQuestion.create({ data: { text, sortOrder: index } });
    created += 1;
  }
  console.log(`포괄 아이스브레이킹 질문 ${ICEBREAKER_SEED.length}개 확인 (새로 ${created}개)`);
}

/**
 * 주제별 질문의 틀(D-87). 질문이 하나도 없는 이야깃거리 관심사에만 틀 문장 3개를 넣는다.
 * 운영자가 /ops 에서 고친 관심사는 건드리지 않는다. 진짜 질문은 운영자가 채운다.
 */
async function seedInterestQuestions() {
  const interests = await prisma.interest.findMany({
    where: { category: { kind: 'INTEREST' }, questions: { none: {} } },
    select: { id: true, name: true },
  });
  for (const interest of interests) {
    await prisma.interestQuestion.createMany({
      data: templateQuestionsFor(interest.name).map((text, sortOrder) => ({
        interestId: interest.id,
        text,
        sortOrder,
      })),
    });
  }
  console.log(`주제별 질문 틀: 관심사 ${interests.length}개에 새로 넣음`);
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

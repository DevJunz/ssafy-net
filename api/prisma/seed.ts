import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  FEATURE_FLAGS,
  PARAMETER_DEFS,
  PARAMETER_KEYS,
} from '@ssafy-net/shared';
import { INTEREST_SEED } from './seed/interests';

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

  for (const group of INTEREST_SEED) {
    const category = await prisma.category.upsert({
      where: { name: group.category },
      update: { sortOrder: categoryOrder },
      create: { name: group.category, sortOrder: categoryOrder },
    });
    categoryOrder += 1;

    let interestOrder = 0;
    for (const name of group.interests) {
      await prisma.interest.upsert({
        where: { name },
        update: { categoryId: category.id, sortOrder: interestOrder },
        create: { name, categoryId: category.id, sortOrder: interestOrder },
      });
      interestOrder += 1;
      total += 1;
    }
  }

  console.log(
    `관심사 ${total}개 / Category ${INTEREST_SEED.length}개 확인 (임시본, B-1로 교체 예정)`,
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
}

async function main() {
  await seedParameters();
  await seedFeatureFlags();
  await seedInterests();
  await seedInviteCode();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

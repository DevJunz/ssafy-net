/**
 * 개발용 더미 사용자 (로컬과 개발 서버용. 운영 컨테이너에서는 아래 빗장에서 멈춘다).
 *
 * 목적은 "사람 수를 채우는 것"이 아니라 **실제와 비슷한 관심사 분포를 만드는 것**이다.
 * 그래야 다음 두 리스크를 앱을 만드는 중에 눈으로 볼 수 있다.
 *   - R-04 Popular Interest Bias: "백엔드+알고리즘+취업 준비"로 수백 명이 겹치는 현상
 *   - R-02 Hairball: 사람 30명 상한([P-13])이 실제로 필요한지
 *
 * 그래서 관심사를 균등하게 뽑지 않고 가중치를 준다(docs/08 §6, design/21 §12).
 *
 * 실행: npm run seed:dev --workspace=api
 * 정리: 같은 스크립트가 googleSub이 'dev-seed-'로 시작하는 사용자를 먼저 지운다.
 */
import { PrismaClient } from '@prisma/client';
import { CLASS_COUNT, FLOOR_OPTIONS } from '@ssafy-net/shared';

/**
 * 운영 DB 를 지키는 빗장. 컨테이너는 NODE_ENV=production 이라, 개발 서버의 .env 에만 있는 APP_ENV=dev 가 없으면 멈춘다.
 * 운영 VM 과 개발 VM 의 SSH 창은 프롬프트만 다르다 — 잘못 붙여 넣어도 여기서 선다(deploy/README.md §11).
 */
if (process.env.NODE_ENV === 'production' && process.env.APP_ENV !== 'dev') {
  console.error(
    'seed:dev 는 로컬이나 개발 서버(APP_ENV=dev)에서만 돌린다. 이 DB 는 운영으로 보인다 — 아무것도 바꾸지 않았다.',
  );
  process.exit(1);
}

const prisma = new PrismaClient();

/** 기본 120명. 부하를 볼 때는 SEED_USERS=1000 처럼 올린다(공개 규모가 약 1,000명이다). */
const USER_COUNT = Number(process.env.SEED_USERS ?? 120);

/** 개발자 조직 전제. 이 관심사들이 절반 가까이 겹치도록 만든다(R-04 재현). */
const VERY_POPULAR = ['백엔드', '알고리즘', '취업 준비', '프론트엔드'];
const POPULAR = ['AI·머신러닝', 'Spring', 'React', '코딩 테스트', '헬스', '영화', '여행', '카페·맛집'];

const SURNAMES = '김이박최정강조윤장임한오서신권황안송류전홍고문양손배'.split('');
const GIVEN = [
  '민준', '서연', '지훈', '수아', '도윤', '하은', '준서', '지민', '예준', '서윤',
  '주원', '채원', '건우', '지우', '현우', '유진', '시우', '다은', '태윤', '소율',
  '지호', '예은', '승우', '가은', '연우', '나윤', '재원', '수빈', '민서', '하준',
];

/** 결정적 난수. 시드를 고정해 매번 같은 데이터를 만든다(재현 가능한 화면). */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const random = makeRandom(20260908);

function pick<T>(items: T[]): T {
  return items[Math.floor(random() * items.length)];
}

/** 가중치 있는 비복원 추출. 인기 관심사가 자주, 희소 관심사가 가끔 뽑힌다. */
function weightedSample(
  pool: { id: string; weight: number }[],
  count: number,
): string[] {
  const remaining = [...pool];
  const chosen: string[] = [];

  while (chosen.length < count && remaining.length > 0) {
    const total = remaining.reduce((sum, item) => sum + item.weight, 0);
    let threshold = random() * total;
    let index = 0;
    while (index < remaining.length - 1) {
      threshold -= remaining[index].weight;
      if (threshold <= 0) break;
      index += 1;
    }
    chosen.push(remaining[index].id);
    remaining.splice(index, 1);
  }

  return chosen;
}

async function main() {
  const removed = await prisma.user.deleteMany({
    where: { googleSub: { startsWith: 'dev-seed-' } },
  });
  if (removed.count > 0) console.log(`기존 더미 사용자 ${removed.count}명 삭제`);

  // 속성(층)은 관심사 풀에서 뺀다. 층은 사람마다 하나씩 따로 붙인다(D-72).
  const interests = await prisma.interest.findMany({
    where: { category: { kind: 'INTEREST' } },
    select: { id: true, name: true },
  });
  if (interests.length === 0) {
    throw new Error('관심사가 없습니다. 먼저 npm run prisma:seed 를 실행하세요.');
  }
  const floors = await prisma.interest.findMany({
    where: { name: { in: FLOOR_OPTIONS } },
    select: { id: true, name: true },
    orderBy: { sortOrder: 'asc' },
  });

  const pool = interests.map((interest) => ({
    id: interest.id,
    weight: VERY_POPULAR.includes(interest.name)
      ? 40
      : POPULAR.includes(interest.name)
        ? 12
        : 1 + random() * 3, // 나머지는 1~4 사이로 흩뿌린다
  }));
  const byName = new Map(interests.map((i) => [i.name, i.id]));

  // Network 후보([P-04] 전원 공통 5개)가 실제로 만들어지도록 심는 그룹.
  // 이것이 없으면 M5에서 게이트 판정(docs/10 §4)을 시험해 볼 수 없다.
  const clusters: { size: number; interests: string[] }[] = [
    { size: 5, interests: ['클라이밍', '러닝', '캠핑', '등산', '사진'] },
    { size: 4, interests: ['보드게임', 'PC 게임', '애니메이션', '웹툰', '콘솔 게임'] },
    { size: 6, interests: ['백엔드', 'DevOps', '클라우드·인프라', '보안', '오픈소스 기여'] },
    { size: 4, interests: ['요리', '카페·맛집', '자취', '술·맥주', '여행'] },
  ];

  const clusterAssignment = new Map<number, string[]>();
  let cursor = 0;
  for (const cluster of clusters) {
    const ids = cluster.interests
      .map((name) => byName.get(name))
      .filter((id): id is string => Boolean(id));
    for (let i = 0; i < cluster.size; i += 1) {
      clusterAssignment.set(cursor, ids);
      cursor += 1;
    }
  }

  const usedNicknames = new Set<string>();
  let totalInterests = 0;

  for (let index = 0; index < USER_COUNT; index += 1) {
    const realName = `${pick(SURNAMES)}${pick(GIVEN)}`;
    const classNo = `${1 + Math.floor(random() * CLASS_COUNT)}반`;
    // 층은 반과 느슨하게 묶는다. 같은 반은 대체로 같은 층에 있지만 예외를 둔다.
    const floor = floors.length
      ? floors[Math.min(floors.length - 1, Math.floor(((Number(classNo.replace('반', '')) - 1) / CLASS_COUNT) * floors.length + (random() < 0.2 ? 1 : 0)))]
      : null;

    // 표시명 종류별 수락률을 나눠 봐야 하므로(R-13) 두 종류를 섞는다.
    const useRealName = random() < 0.35;
    let nickname: string | null = null;
    if (!useRealName) {
      let candidate = '';
      do {
        candidate = `${pick(['달리는', '조용한', '느긋한', '부지런한', '유쾌한', '차분한', '엉뚱한'])}${pick(['토끼', '고래', '여우', '수달', '너구리', '펭귄', '고양이', '치타'])}${Math.floor(random() * 90) + 10}`;
      } while (usedNicknames.has(candidate));
      usedNicknames.add(candidate);
      nickname = candidate;
    }

    // 평균 7개를 목표로 한다(A-01의 가설값). 최소 5 최대 15.
    const target = 5 + Math.floor(random() * 7);
    const seeded = clusterAssignment.get(index) ?? [];
    const rest = weightedSample(
      pool.filter((item) => !seeded.includes(item.id)),
      Math.max(0, target - seeded.length),
    );
    const interestIds = [...seeded, ...rest, ...(floor ? [floor.id] : [])];

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          googleSub: `dev-seed-${index}`,
          email: `dev-seed-${index}@example.com`,
          realName,
          classNo,
          displayNameType: useRealName ? 'REAL' : 'NICKNAME',
          nickname,
          status: 'ACTIVE',
          onboardedAt: new Date(Date.now() - Math.floor(random() * 5) * 86_400_000),
        },
      });

      await tx.userInterest.createMany({
        data: interestIds.map((interestId) => ({ userId: user.id, interestId })),
      });
      await tx.interest.updateMany({
        where: { id: { in: interestIds } },
        data: { holderCount: { increment: 1 } },
      });
      await tx.userInterestChange.createMany({
        data: interestIds.map((interestId) => ({
          userId: user.id,
          interestId,
          action: 'ADD' as const,
        })),
      });
    });

    totalInterests += interestIds.length - (floor ? 1 : 0);
  }

  await seedAroundRealUser(pool);

  // 사용자를 지우면 user_interest는 CASCADE로 사라지지만 holder_count는 그대로다.
  // 비정규화 값이므로 시드 끝에서 실제 행 수로 맞춘다(api/scripts/recount-interest-holders.sql과 같은 계산).
  await prisma.$executeRawUnsafe(`
    UPDATE interest i
    SET holder_count = COALESCE(c.n, 0)
    FROM (
      SELECT id, (
        SELECT count(*) FROM user_interest ui
        JOIN "user" u ON u.id = ui.user_id
        WHERE ui.interest_id = interest.id AND u.status = 'ACTIVE'
      ) AS n
      FROM interest
    ) AS c
    WHERE i.id = c.id AND i.holder_count IS DISTINCT FROM COALESCE(c.n, 0)
  `);

  const top = await prisma.interest.findMany({
    where: { category: { kind: 'INTEREST' } },
    orderBy: { holderCount: 'desc' },
    take: 6,
    select: { name: true, holderCount: true },
  });
  const empty = await prisma.interest.count({
    where: { holderCount: 0, category: { kind: 'INTEREST' } },
  });
  const activeUsers = await prisma.user.count({ where: { status: 'ACTIVE' } });

  console.log(`더미 사용자 ${USER_COUNT}명 생성`);
  console.log(`평균 관심사 ${(totalInterests / USER_COUNT).toFixed(1)}개`);
  console.log(
    `상위 관심사: ${top
      .map((i) => `${i.name} ${i.holderCount}명(${Math.round((i.holderCount / activeUsers) * 100)}%)`)
      .join(', ')}`,
  );
  console.log(`아무도 고르지 않은 관심사: ${empty}개`);
}

/**
 * 실제로 로그인한 사람(더미가 아닌 사용자) 주변에 클러스터를 만든다.
 *
 * 로컬에서 화면을 확인하려면 본인이 Similar People과 Network 추천에 걸려야 한다.
 * 가중치 기반 더미만으로는 비인기 관심사를 고른 사람과 겹치는 사람이 거의 없다
 * — 이것 자체가 R-04의 결과이고, 그래서 이 보정이 필요하다.
 */
async function seedAroundRealUser(pool: { id: string; weight: number }[]) {
  const real = await prisma.user.findFirst({
    where: { googleSub: { not: { startsWith: 'dev-seed-' } }, status: 'ACTIVE' },
    include: { interests: true },
  });
  if (!real || real.interests.length === 0) return;

  const mine = real.interests.map((row) => row.interestId);
  const others = pool.filter((item) => !mine.includes(item.id));

  for (let index = 0; index < 5; index += 1) {
    // 내 관심사를 대부분 공유하되 한 명씩 조금씩 다르게 한다.
    const shared = mine.slice(0, mine.length - (index % 2));
    const extra = weightedSample(others, 2 + (index % 3));
    const interestIds = [...new Set([...shared, ...extra])];

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          googleSub: `dev-seed-near-${index}`,
          email: `dev-seed-near-${index}@example.com`,
          realName: `${pick(SURNAMES)}${pick(GIVEN)}`,
          classNo: `${1 + Math.floor(random() * CLASS_COUNT)}반`,
          displayNameType: index % 2 === 0 ? 'REAL' : 'NICKNAME',
          nickname: index % 2 === 0 ? null : `이웃토끼${10 + index}`,
          status: 'ACTIVE',
          onboardedAt: new Date(),
        },
      });
      await tx.userInterest.createMany({
        data: interestIds.map((interestId) => ({ userId: user.id, interestId })),
      });
      await tx.interest.updateMany({
        where: { id: { in: interestIds } },
        data: { holderCount: { increment: 1 } },
      });
    });
  }

  console.log(`${real.email} 주변 클러스터 5명 추가 (관심사 ${mine.length}개 공유)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

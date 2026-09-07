// Phase 0 Mock Data — 실제 백엔드/DB 없이 프론트에서만 사용한다.
// 변경하기 쉽도록 사람/관심사는 이름 기반으로 적고, 아래에서 id로 변환한다.

export type Interest = { id: string; name: string; color: string };
export type User = { id: string; name: string; team: string };
export type UserInterest = { userId: string; interestId: string };
export type Post = {
  id: string;
  interestId: string;
  userId: string;
  content: string;
  createdAt: string;
};
export type NetworkSuggestion = {
  id: string;
  memberIds: string[];
  commonInterestIds: string[];
};

export const ME_ID = 'u-me';

export const interests: Interest[] = [
  { id: 'i-soccer', name: '축구', color: '#2f9e44' },
  { id: 'i-backend', name: '백엔드', color: '#1c7ed6' },
  { id: 'i-frontend', name: '프론트엔드', color: '#f08c00' },
  { id: 'i-ai', name: 'AI', color: '#7048e8' },
  { id: 'i-oss', name: 'OSS', color: '#0ca678' },
  { id: 'i-reading', name: '독서', color: '#a61e4d' },
  { id: 'i-running', name: '러닝', color: '#e8590c' },
  { id: 'i-climbing', name: '클라이밍', color: '#5c940d' },
  { id: 'i-movie', name: '영화', color: '#c2255c' },
  { id: 'i-game', name: '게임', color: '#6741d9' },
  { id: 'i-travel', name: '여행', color: '#0b7285' },
  { id: 'i-music', name: '음악', color: '#e64980' },
  { id: 'i-data', name: '데이터', color: '#1098ad' },
  { id: 'i-devops', name: 'DevOps', color: '#495057' },
  { id: 'i-algo', name: '알고리즘', color: '#d9480f' },
];

const interestIdByName = new Map(interests.map((i) => [i.name, i.id]));

// [id, 이름, 팀, 관심사 이름 목록]
// 의도적으로 겹치는 그룹을 만든다.
//  - 그룹 A (나 포함): 축구·백엔드·OSS·독서·러닝 공통  → 민수, 지수, 철수
//  - 그룹 B (나 포함): 백엔드·AI·DevOps·OSS·러닝 공통 → 하은, 도윤, 서연
//  - 그룹 C (나 제외): 프론트엔드·영화·음악·여행·게임 공통 → 예준, 수아, 지호, 유진, 시우
//  - 나머지는 다양하게 흩어진 사람들
const rawUsers: [string, string, string, string[]][] = [
  [ME_ID, '나', '플랫폼팀', ['백엔드', '축구', 'OSS', '독서', '러닝', 'AI', 'DevOps']],

  ['u-minsu', '민수', '플랫폼팀', ['축구', '백엔드', 'OSS', '독서', '러닝', '게임']],
  ['u-jisu', '지수', '데이터팀', ['축구', '백엔드', 'OSS', '독서', '러닝', 'AI', '데이터']],
  ['u-cheolsu', '철수', '인프라팀', ['축구', '백엔드', 'OSS', '독서', '러닝', 'DevOps']],

  ['u-haeun', '하은', 'AI팀', ['백엔드', 'AI', 'DevOps', 'OSS', '러닝', '음악']],
  ['u-doyun', '도윤', '인프라팀', ['백엔드', 'AI', 'DevOps', 'OSS', '러닝', '알고리즘', '여행']],
  ['u-seoyeon', '서연', 'AI팀', ['백엔드', 'AI', 'DevOps', 'OSS', '러닝', '영화']],

  ['u-yejun', '예준', '프론트팀', ['프론트엔드', '영화', '음악', '여행', '게임', '알고리즘']],
  ['u-sua', '수아', '프론트팀', ['프론트엔드', '영화', '음악', '여행', '게임', '클라이밍']],
  ['u-jiho', '지호', '데이터팀', ['프론트엔드', '영화', '음악', '여행', '게임', '데이터']],
  ['u-yujin', '유진', '프론트팀', ['프론트엔드', '영화', '음악', '여행', '게임', '독서']],
  ['u-siwoo', '시우', '모바일팀', ['프론트엔드', '영화', '음악', '여행', '게임', '축구', '러닝']],

  ['u-junhyuk', '준혁', '모바일팀', ['클라이밍', '러닝', '축구', '여행']],
  ['u-nayeon', '나연', '데이터팀', ['데이터', 'AI', '알고리즘', '독서', '영화']],
  ['u-taeyang', '태양', '인프라팀', ['DevOps', '백엔드', '게임', '음악']],
  ['u-jimin', '지민', 'AI팀', ['프론트엔드', 'AI', '데이터', '독서']],
  ['u-hyunwoo', '현우', '플랫폼팀', ['알고리즘', '게임', '축구', '백엔드']],
  ['u-soyul', '소율', '모바일팀', ['클라이밍', '여행', '음악', '러닝', '영화']],
  ['u-minjae', '민재', '프론트팀', ['OSS', '프론트엔드', 'DevOps', '알고리즘', '독서']],
  ['u-daeun', '다은', '디자인팀', ['독서', '영화', '음악', '여행']],
  ['u-seunghyun', '승현', '인프라팀', ['축구', '게임', '러닝', '클라이밍', 'DevOps']],
  ['u-chaewon', '채원', 'AI팀', ['AI', '데이터', '백엔드', '알고리즘', 'OSS']],
  ['u-geonwoo', '건우', '프론트팀', ['프론트엔드', '게임', '알고리즘']],
  ['u-arin', '아린', '디자인팀', ['여행', '음악', '독서', 'AI', '데이터']],
  ['u-jaewon', '재원', '플랫폼팀', ['백엔드', 'DevOps', '클라이밍', '축구', '독서']],
];

export const users: User[] = rawUsers.map(([id, name, team]) => ({ id, name, team }));

export const userInterests: UserInterest[] = rawUsers.flatMap(([id, , , names]) =>
  names.map((n) => {
    const interestId = interestIdByName.get(n);
    if (!interestId) throw new Error(`Unknown interest: ${n}`);
    return { userId: id, interestId };
  }),
);

const userIdByName = new Map(users.map((u) => [u.name, u.id]));

// [관심사, 작성자, 내용]
const rawPosts: [string, string, string][] = [
  ['백엔드', '민수', 'NestJS 사용하시는 분 있나요? 모듈 구조 얘기 나눠보고 싶어요.'],
  ['백엔드', '지수', 'Redis 운영 경험 이야기 나눠보고 싶습니다.'],
  ['백엔드', '재원', 'Kotlin + Spring 전환하신 팀 있으면 후기 부탁드려요.'],
  ['축구', '철수', '이번 주 토요일 사내 풋살 한 자리 남았습니다!'],
  ['축구', '시우', '챔스 결승 같이 볼 사람 구합니다.'],
  ['OSS', '하은', '처음 기여할 만한 레포 추천해 주실 분?'],
  ['OSS', '민재', '오픈소스 PR 리뷰 같이 봐주실 분 찾아요.'],
  ['AI', '서연', '사내 RAG 파이프라인 같이 만들어 볼 분 있을까요?'],
  ['AI', '나연', '요즘 읽는 논문 공유하는 소모임 어떠세요?'],
  ['독서', '유진', '이번 달 책 "클린 아키텍처" 같이 읽어요.'],
  ['독서', '다은', '점심시간 독서 모임 매주 수요일에 합니다.'],
  ['러닝', '도윤', '한강 야간 러닝 수요일 8시, 같이 뛰실 분!'],
  ['프론트엔드', '예준', 'React 19 서버 컴포넌트 써보신 분 계신가요?'],
  ['프론트엔드', '수아', 'Storybook 셋업 공유합니다.'],
  ['DevOps', '태양', 'ArgoCD 도입 고민 중인데 경험 나눠주실 분?'],
  ['클라이밍', '준혁', '퇴근 후 볼더링 같이 가실 분 모집!'],
  ['게임', '현우', '사내 롤 내전 팀원 구합니다.'],
  ['여행', '소율', '제주 한달살기 정보 공유해요.'],
  ['음악', '아린', '사내 밴드 베이스 구인 중입니다.'],
  ['데이터', '채원', 'dbt 써보신 분 계시면 얘기 나눠요.'],
  ['알고리즘', '건우', '매주 화요일 알고리즘 스터디 인원 추가 모집.'],
  ['영화', '지호', '이번 주말 영화 같이 보러 갈 사람?'],
];

export const posts: Post[] = rawPosts.map(([interestName, userName, content], idx) => ({
  id: `p-${idx + 1}`,
  interestId: interestIdByName.get(interestName)!,
  userId: userIdByName.get(userName)!,
  content,
  createdAt: `${Math.max(1, 12 - idx)}시간 전`,
}));

// 추천 네트워크: 멤버 3~5명, 전체 공통 관심사 >= 5
// 실제 알고리즘 없이 Mock으로 미리 정의하고, 공통 관심사는 데이터에서 계산한다.
function intersectionOf(memberIds: string[]): string[] {
  const sets = memberIds.map(
    (uid) => new Set(userInterests.filter((ui) => ui.userId === uid).map((ui) => ui.interestId)),
  );
  return interests.map((i) => i.id).filter((iid) => sets.every((s) => s.has(iid)));
}

const rawNetworks: string[][] = [
  [ME_ID, 'u-minsu', 'u-jisu', 'u-cheolsu'],
  [ME_ID, 'u-haeun', 'u-doyun', 'u-seoyeon'],
  ['u-yejun', 'u-sua', 'u-jiho', 'u-yujin', 'u-siwoo'],
];

export const networkSuggestions: NetworkSuggestion[] = rawNetworks.map((memberIds, idx) => ({
  id: `n-${idx + 1}`,
  memberIds,
  commonInterestIds: intersectionOf(memberIds),
}));

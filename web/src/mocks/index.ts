/**
 * 데모 모드 — 서버 없이 프론트만으로 돌린다 (디자인 피드백용).
 *
 * `fixtures.json`은 **실제 API 응답을 캡처한 것**이다(`web/scripts/capture-fixtures.cjs`).
 * 지어낸 목이 아니라서 그래프 밀도, 공통 관심사 개수, 정렬 순서가 실제와 같다.
 * 대신 상태 변화는 여기서 흉내 낸다 — 수락하면 목록에서 빠지고 연결에 생기는 정도까지.
 *
 * 켜는 법: `VITE_DEMO=1 npm run build`. 끄면 이 파일은 번들에 들어가지만 호출되지 않는다.
 *
 * **실제 사용자 데이터는 들어 있지 않다.** 캡처할 때 실제 계정을 비활성으로 빼고 받았고,
 * 스크립트가 끝에서 흔적이 남았는지 검사한다.
 */
import raw from './fixtures.json';

export const DEMO_MODE = import.meta.env.VITE_DEMO === '1';

type Json = Record<string, any>;
const fixtures = raw as Record<string, any>;

/** 원본을 건드리지 않도록 복제해서 쓴다. 초기화하면 처음 상태로 돌아온다. */
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export type DemoScene = 'app' | 'onboarding';
const SCENE_KEY = 'demo-scene';

export function currentScene(): DemoScene {
  try {
    return sessionStorage.getItem(SCENE_KEY) === 'onboarding' ? 'onboarding' : 'app';
  } catch {
    return 'app';
  }
}

export function setScene(scene: DemoScene): void {
  try {
    sessionStorage.setItem(SCENE_KEY, scene);
  } catch {
    /* 사파리 비공개 모드 등 */
  }
  window.location.href = '/';
}

// ── 흉내 낼 상태 ─────────────────────────────────────────

interface State {
  me: Json;
  catalog: Json;
  received: Json[];
  sent: Json[];
  connections: Json[];
  notifications: Json[];
  followUps: Json[];
  myPosts: Json[];
  networks: Record<string, Json[]>;
  networkDetail: Json | null;
  onboardingStep: 'MATTERMOST' | 'DISPLAY_NAME' | 'INTERESTS' | 'DONE';
  onboardingName: string | null;
  demoCode: string;
  createdInterests: Json[];
}

const listOf = (value: any): Json[] =>
  Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];

function freshState(): State {
  const scene = currentScene();
  const me = clone(fixtures['/me']);
  return {
    me: scene === 'onboarding' ? { ...me, status: 'ONBOARDING' } : me,
    catalog: clone(fixtures['/interests']),
    received: clone(listOf(fixtures['/connection-requests?box=received'])),
    sent: clone(listOf(fixtures['/connection-requests?box=sent'])),
    connections: clone(listOf(fixtures['/connections'])),
    notifications: clone(listOf(fixtures['/notifications'])),
    followUps: clone(fixtures['/follow-ups/pending'] ?? []),
    myPosts: clone(listOf(fixtures['/me/posts'])),
    networks: {
      recommended: clone(listOf(fixtures['/networks?tab=recommended'])),
      joined: clone(listOf(fixtures['/networks?tab=joined'])),
      activated: clone(listOf(fixtures['/networks?tab=activated'])),
    },
    networkDetail: null,
    onboardingStep: 'MATTERMOST',
    onboardingName: null,
    demoCode: '482913',
    createdInterests: [],
  };
}

let state = freshState();
/** 거절 취소(1분) 때문에 방금 거절한 요청을 잠시 들고 있는다. */
let rejected: Json | null = null;

export function resetDemo(): void {
  state = freshState();
  window.location.reload();
}

// ── 오류 ─────────────────────────────────────────────────

export class MockError extends Error {
  constructor(readonly code: string, message: string, readonly details?: Json) {
    super(message);
  }
}

// ── 조회 ─────────────────────────────────────────────────

/** 캡처에 없는 경로는 비슷한 것으로 대신한다. 디자인 확인이 목적이라 빈 화면보다 낫다. */
function fallbackFor(path: string): unknown {
  const base = path.split('?')[0];
  if (base.startsWith('/interests/') && base.split('/').length === 3) {
    const any = Object.keys(fixtures).find((k) => /^\/interests\/[0-9a-f-]{36}$/.test(k));
    return any ? fixtures[any] : null;
  }
  if (base.startsWith('/users/')) {
    const any = Object.keys(fixtures).find((k) => k.startsWith('/users/'));
    return any ? fixtures[any] : null;
  }
  if (base.startsWith('/connections/')) {
    const any = Object.keys(fixtures).find((k) => /^\/connections\/[0-9a-f-]{36}$/.test(k));
    return any ? fixtures[any] : null;
  }
  if (base.startsWith('/graph')) return fixtures['/graph?anchor=me'];
  return null;
}

function handleGet(path: string): unknown {
  const [base, query = ''] = path.split('?');

  switch (base) {
    case '/me':
      return state.me;
    case '/interests':
      return state.catalog;
    case '/notifications':
      return state.notifications;
    case '/notifications/badge':
      return { count: state.notifications.filter((n) => n.actionRequired && !n.resolvedAt).length };
    case '/follow-ups/pending':
      return state.followUps;
    case '/connections':
      return state.connections;
    case '/me/posts':
      return state.myPosts;
    case '/onboarding/state':
      return {
        step: state.onboardingStep,
        realNamePreview: state.onboardingName,
        mattermostUsername: null,
        codeSent: false,
      };
    default:
      break;
  }

  if (base === '/connection-requests') {
    return query.includes('sent') ? state.sent : state.received;
  }
  if (base === '/networks') {
    const tab = new URLSearchParams(query).get('tab') ?? 'recommended';
    return state.networks[tab] ?? [];
  }
  if (base === '/interests/similar') {
    const q = (new URLSearchParams(query).get('q') ?? '').trim();
    const key = Object.keys(fixtures).find(
      (k) => k.startsWith('/interests/similar') && decodeURIComponent(k).includes(q),
    );
    if (key) return fixtures[key];
    // 캡처에 없는 검색어는 이름에 포함되는 관심사로 흉내 낸다.
    const hits: Json[] = [];
    for (const category of state.catalog.categories ?? []) {
      if (category.kind !== 'INTEREST') continue;
      for (const interest of category.interests) {
        const names = [interest.name, ...(interest.aliases ?? [])];
        if (q && names.some((n: string) => n.toLowerCase().includes(q.toLowerCase()))) {
          hits.push({
            id: interest.id,
            name: interest.name,
            categoryId: category.id,
            categoryName: category.name,
            holderCount: interest.holderCount,
            match: names.some((n: string) => n.toLowerCase() === q.toLowerCase()) ? 'EXACT' : 'SIMILAR',
          });
        }
      }
    }
    return hits.slice(0, 5);
  }

  if (base.startsWith('/networks/')) {
    const id = base.split('/')[2];
    if (state.networkDetail?.id === id) return state.networkDetail;
    const captured = fixtures[base] ?? fallbackFor(base);
    state.networkDetail = clone(captured);
    return state.networkDetail;
  }

  // 받은 요청 상세. 캡처에 없으므로 목록 항목으로 만든다. 없으면 상세 화면이 렌더 중에 죽는다.
  if (base.startsWith('/connection-requests/')) {
    const id = base.split('/')[2];
    const request = state.received.find((r) => r.id === id);
    if (request) {
      return {
        id: request.id,
        from: request.from,
        commonInterests: request.commonInterests ?? [],
        message: request.messagePreview,
        createdAt: new Date(Date.now() - 86_400_000).toISOString(),
        expiresAt: request.expiresAt,
        daysLeft: request.daysLeft,
        revealsMyRealName: state.me.displayNameType === 'NICKNAME',
        myRealName: state.me.realName,
      };
    }
  }

  const exact = fixtures[path] ?? fixtures[base];
  return exact ?? fallbackFor(path) ?? {};
}

// ── 변경 ─────────────────────────────────────────────────

function handleMutation(method: string, path: string, body: Json): unknown {
  const [base] = path.split('?');
  const parts = base.split('/');

  // 연결 요청 보내기
  if (method === 'POST' && base === '/connection-requests') {
    state.sent = [
      {
        id: `demo-sent-${Date.now()}`,
        counterpart: { id: body.targetId, displayName: '방금 요청한 사람', displayNameType: 'NICKNAME', interests: [], commonCount: 0, relation: { status: 'REQUEST_SENT', requestId: null, reRequestableAt: null } },
        message: body.message,
        commonInterests: [],
        commonCount: 0,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      },
      ...state.sent,
    ];
    return { warning: null };
  }

  // 수락 / 거절 / 거절 취소 / 요청 취소
  if (base.startsWith('/connection-requests/')) {
    const id = parts[2];
    const action = parts[3];
    const request = state.received.find((r) => r.id === id);

    if (method === 'POST' && action === 'accept') {
      state.received = state.received.filter((r) => r.id !== id);
      const detail = clone(fixtures[Object.keys(fixtures).find((k) => /^\/connections\/[0-9a-f-]{36}$/.test(k)) ?? ''] ?? {});
      state.connections = [detail, ...state.connections];
      state.notifications = state.notifications.map((n) =>
        n.actionRequired ? { ...n, actionRequired: false, resolvedAt: new Date().toISOString() } : n,
      );
      return detail;
    }
    // 거절 취소가 먼저다. `/reject/undo`는 action도 'reject'라 순서가 뒤바뀌면 안 된다.
    if (method === 'POST' && action === 'reject' && parts[4] === 'undo') {
      if (rejected) state.received = [rejected, ...state.received];
      rejected = null;
      return {};
    }
    if (method === 'POST' && action === 'reject') {
      state.received = state.received.filter((r) => r.id !== id);
      rejected = request ?? null;
      return { undoUntil: new Date(Date.now() + 60_000).toISOString() };
    }
    if (method === 'DELETE') {
      state.sent = state.sent.filter((r) => r.id !== id);
      return {};
    }
  }

  // 대화 시작 표시
  if (method === 'POST' && parts[3] === 'mark-started') {
    state.connections = state.connections.map((c) =>
      c.id === parts[2] ? { ...c, iMarkedStarted: true, markedStarted: true } : c,
    );
    return handleGet(`/connections/${parts[2]}`);
  }

  // 후속 확인
  if (method === 'POST' && base.startsWith('/follow-ups/')) {
    state.followUps = state.followUps.filter((f) => f.id !== parts[2]);
    return { ok: true };
  }

  // 알림 읽음
  if (method === 'POST' && base.startsWith('/notifications/')) {
    state.notifications = state.notifications.map((n) =>
      n.id === parts[2] ? { ...n, readAt: new Date().toISOString() } : n,
    );
    return {};
  }

  // 관심사 저장 / 하나 추가·제거
  if (method === 'PUT' && base === '/me/interests') {
    const chosen = new Set<string>(body.interestIds ?? []);
    const refs: Json[] = [];
    for (const category of state.catalog.categories ?? []) {
      for (const interest of category.interests) {
        interest.mine = chosen.has(interest.id);
        if (interest.mine) refs.push({ id: interest.id, name: interest.name, categoryId: category.id });
      }
    }
    state.catalog.selectedCount = (state.catalog.categories ?? [])
      .filter((c: Json) => c.kind === 'INTEREST')
      .reduce((n: number, c: Json) => n + c.interests.filter((i: Json) => i.mine).length, 0);
    state.me = { ...state.me, interests: refs };
    return { interests: refs, notice: '그래프와 추천이 바뀌었습니다.' };
  }
  if (base.startsWith('/me/interests/')) {
    const id = parts[3];
    for (const category of state.catalog.categories ?? []) {
      for (const interest of category.interests) {
        if (interest.id === id) interest.mine = method === 'POST';
      }
    }
    return state.me.interests ?? [];
  }

  // 관심사 직접 추가 — 실제 서버와 같은 규칙으로 막는다
  if (method === 'POST' && base === '/interests') {
    const name = String(body.name ?? '').trim();
    const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^가-힣a-z0-9+#]/g, '');
    for (const category of state.catalog.categories ?? []) {
      for (const interest of category.interests) {
        const all = [interest.name, ...(interest.aliases ?? [])];
        if (all.some((n: string) => norm(n) === norm(name))) {
          throw new MockError('INTEREST_EXISTS', `"${interest.name}"이(가) 이미 있습니다. 목록에서 골라주세요.`, {
            interest: { id: interest.id, name: interest.name, categoryId: category.id, categoryName: category.name, holderCount: interest.holderCount, match: 'EXACT' },
          });
        }
      }
    }
    const similar = handleGet(`/interests/similar?q=${encodeURIComponent(name)}`) as Json[];
    if (similar.length > 0 && !body.confirmSimilar) {
      throw new MockError('INTEREST_SIMILAR', '비슷한 관심사가 이미 있습니다.', { similar });
    }
    const created = { id: `demo-interest-${Date.now()}`, name, categoryId: body.categoryId, aliases: [], holderCount: 0 };
    const target = (state.catalog.categories ?? []).find((c: Json) => c.id === body.categoryId);
    if (target) target.interests.push({ ...created, mine: false, status: 'ACTIVE' });
    state.createdInterests.push(created);
    return created;
  }

  // 글
  if (method === 'POST' && base === '/posts') {
    const post = {
      id: `demo-post-${Date.now()}`,
      interestId: body.interestId,
      interestName: '내 관심사',
      content: body.content,
      createdAt: new Date().toISOString(),
    };
    state.myPosts = [post, ...state.myPosts];
    return post;
  }
  if (method === 'DELETE' && base.startsWith('/posts/')) {
    state.myPosts = state.myPosts.filter((p) => p.id !== parts[2]);
    return {};
  }

  // 네트워크
  if (method === 'POST' && base.startsWith('/networks/')) {
    const action = parts[3];
    const detail: Json = (state.networkDetail ??= clone(
      handleGet(`/networks/${parts[2]}`) as Json,
    ));
    if (action === 'join') {
      detail.myDecision = 'JOINED';
      detail.joinedCount = (detail.joinedCount ?? 0) + 1;
      if (detail.joinedCount >= (detail.requiredCount ?? 3)) {
        detail.status = 'ACTIVATED';
        detail.activatedAt = new Date().toISOString();
      }
    }
    if (action === 'leave') {
      detail.myDecision = 'PENDING';
      detail.joinedCount = Math.max(0, (detail.joinedCount ?? 1) - 1);
    }
    if (action === 'decline') detail.myDecision = 'DECLINED';
    if (action === 'mark-invited') detail.iMarkedInvited = true;
    return detail;
  }

  // 온보딩
  if (method === 'POST' && base === '/onboarding/mattermost/send') {
    state.onboardingName = `${body.realName}_서울_${body.classNo}`;
    return { sent: true, operatorBypass: false, demoCode: state.demoCode };
  }
  if (method === 'POST' && base === '/onboarding/mattermost/verify') {
    if (String(body.code) !== state.demoCode) {
      throw new MockError('VALIDATION_FAILED', `데모에서는 ${state.demoCode} 을 입력하세요.`);
    }
    state.onboardingStep = 'DISPLAY_NAME';
    return { ok: true };
  }
  if (method === 'POST' && base === '/onboarding/display-name') {
    state.onboardingStep = 'INTERESTS';
    return { displayName: body.type === 'REAL' ? state.onboardingName : body.nickname };
  }
  if (method === 'POST' && base === '/onboarding/complete') {
    state.onboardingStep = 'DONE';
    state.me = { ...state.me, status: 'ACTIVE' };
    return { user: state.me };
  }

  return {};
}

/** 실제 네트워크 왕복처럼 보이도록 약간 늦춘다. 즉시 반환하면 로딩 상태를 볼 수 없다. */
const delay = () => new Promise((r) => setTimeout(r, 120 + Math.random() * 160));

export async function mockRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  await delay();
  const payload = (body ?? {}) as Json;
  const result =
    method === 'GET' ? handleGet(path) : handleMutation(method, path, payload);
  return result as T;
}

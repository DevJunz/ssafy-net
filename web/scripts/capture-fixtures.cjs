/*
 * 데모용 목 데이터를 **실제 API 응답에서 캡처**한다.
 *
 * 손으로 만든 목은 화면을 거짓으로 보여준다 — 그래프 밀도, 공통 관심사 개수,
 * 정렬 순서가 전부 서버 계산의 결과이기 때문이다. 그래서 지어내지 않고 받아 적는다.
 *
 * 실행 전에 로컬 API와 DB가 떠 있어야 한다.
 *   npm run db:up && npm run dev:api
 *   node web/scripts/capture-fixtures.js
 *
 * 개인정보: 캡처 동안 **실제 계정을 ACTIVE에서 빼서** 그래프·추천에 잡히지 않게 한다.
 * 결과물에는 더미 사용자만 들어간다. 끝나면 원래 상태로 되돌린다.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken'));
const secret = fs.readFileSync(path.join(ROOT, 'api/.env'), 'utf8').match(/^SESSION_SECRET="?([^"\n]+)"?/m)[1];
// 줄바꿈이 들어가면 docker exec 인자가 거기서 끊긴다. 한 줄로 눌러서 보낸다.
const psql = (sql) =>
  execSync(
    `docker exec ssafy-net-db psql -U ssafynet -d ssafynet -tAc "${sql.replace(/\s*\n\s*/g, ' ').replace(/"/g, '\\"')}"`,
  )
    .toString()
    .trim();
const BASE = 'http://localhost:3000/api';
const OUT = path.join(ROOT, 'web/src/mocks/fixtures.json');

const fixtures = {};
let cookie = '';

async function grab(p) {
  const res = await fetch(BASE + p, { headers: { cookie } });
  if (!res.ok) {
    console.warn(`  건너뜀 ${p} → ${res.status}`);
    return null;
  }
  const body = await res.json();
  fixtures[p] = body;
  return body;
}



function buildStates(me, others) {
  const [a, b, c, d, e] = others;
  const iid = () => psql(`SELECT interest_id FROM user_interest WHERE user_id='${me}' LIMIT 1`);
  const commons = (x) => psql(`SELECT COALESCE(string_agg(quote_literal(t.id), ','), '') FROM (SELECT i.id FROM user_interest ui JOIN interest i ON i.id=ui.interest_id JOIN category cat ON cat.id=i.category_id AND cat.kind='INTEREST' WHERE ui.user_id='${x}' AND i.id IN (SELECT interest_id FROM user_interest WHERE user_id='${me}') LIMIT 4) t`);

  // 기존 상태 비우기 (더미 사이의 것만)
  psql('DELETE FROM follow_up_check');
  psql('DELETE FROM connection');
  psql('DELETE FROM connection_request');
  psql('DELETE FROM network_member');
  psql('DELETE FROM network_recommendation');
  psql('DELETE FROM notification');
  psql('DELETE FROM interest_post');

  // 받은 요청 2건 — 하나는 미읽음, 하나는 읽음
  const mkRequest = (from, to, msg, entry, readAt) => {
    psql(`INSERT INTO connection_request (id, requester_id, target_id, message, status, entry_point, common_interest_ids, created_at, expires_at, read_at)
          VALUES (gen_random_uuid(), '${from}', '${to}', '${msg}', 'PENDING', '${entry}', ARRAY[${commons(from === me ? to : from)}]::text[], now() - interval '6 hours', now() + interval '3 days', ${readAt ? 'now()' : 'NULL'})`);
  };
  mkRequest(a, me, '같은 관심사가 많아서 연락드립니다. 사이드 프로젝트 어떻게 시작하셨는지 궁금해요.', 'SIMILAR', false);
  mkRequest(b, me, '알고리즘 스터디 같이 하실 분 찾고 있어요. 관심 있으시면 이야기 나눠요.', 'INTEREST_DETAIL', true);
  mkRequest(me, c, '클라이밍 하신다고 보고 연락드려요. 어느 암장 다니세요?', 'GRAPH', false);

  // 성립된 연결 2건 — 하나는 후속 확인 대기
  const mkConnection = (x, y, initiator, marked) => {
    const [lo, hi] = [x, y].sort();
    psql(`INSERT INTO connection (id, user_a_id, user_b_id, initiator_id, established_at, initiator_marked_at)
          VALUES (gen_random_uuid(), '${lo}', '${hi}', '${initiator}', now() - interval '2 days', ${marked ? "now() - interval '1 day'" : 'NULL'})`);
    return psql(`SELECT id FROM connection WHERE user_a_id='${lo}' AND user_b_id='${hi}'`);
  };
  const conn1 = mkConnection(me, d, me, true);
  mkConnection(me, e, e, false);

  // 후속 확인 1건 대기 (오버레이가 뜬다)
  psql(`INSERT INTO follow_up_check (id, user_id, subject_type, subject_id, asked_at) VALUES (gen_random_uuid(), '${me}', 'CONNECTION', '${conn1}', now() - interval '2 hours')`);

  // 관심사 글
  const myInterest = iid();
  psql(`INSERT INTO interest_post (id, author_id, interest_id, content, created_at) VALUES (gen_random_uuid(), '${me}', '${myInterest}', '이번 주말에 같이 공부하실 분 있을까요? 카페에서 세 시간 정도 생각하고 있어요.', now() - interval '3 hours')`);
  psql(`INSERT INTO interest_post (id, author_id, interest_id, content, created_at) VALUES (gen_random_uuid(), '${a}', '${myInterest}', '최근에 읽은 자료 중에 정리가 잘 된 게 있어서 공유합니다. 관심 있으시면 말씀 주세요.', now() - interval '9 hours')`);

  // 알림함 (배지에 세는 것 하나 포함)
  const notify = (type, payload, target, actionRequired, hoursAgo) =>
    psql(`INSERT INTO notification (id, user_id, type, payload, target_path, action_required, created_at) VALUES (gen_random_uuid(), '${me}', '${type}', '${JSON.stringify(payload).replace(/'/g, "''")}'::jsonb, '${target}', ${actionRequired}, now() - interval '${hoursAgo} hours')`);
  const nameOf = (x) => psql(`SELECT COALESCE(nickname, real_name || '_' || campus || '_' || class_no) FROM "user" WHERE id='${x}'`);
  notify('CONNECTION_REQUEST_RECEIVED', { displayName: nameOf(a), commonInterests: ['백엔드', '알고리즘', '사이드 프로젝트'] }, '/connections?tab=received', true, 6);
  notify('CONNECTION_ACCEPTED', { realName: psql(`SELECT real_name || '_' || campus || '_' || class_no FROM "user" WHERE id='${d}'`), mattermostUsername: 'demo_user_d' }, '/connections', false, 48);
  notify('DIGEST', { reason: '어제 새로 온 사람 4명이 회원님과 관심사가 3개 이상 겹칩니다. 새 글도 2개 있습니다.' }, '/', false, 20);

  return { conn1 };
}

(async () => {
  const realStatus = psql("SELECT status FROM \"user\" WHERE google_sub NOT LIKE 'dev-seed-%' LIMIT 1");
  const realId = psql("SELECT id FROM \"user\" WHERE google_sub NOT LIKE 'dev-seed-%' LIMIT 1");
  if (realId) {
    // 실제 계정을 캡처 대상에서 뺀다. 목 데이터에 실명이 들어가지 않게 한다.
    psql(`UPDATE "user" SET status='ONBOARDING' WHERE id='${realId}'`);
    console.log(`실제 계정을 캡처에서 제외 (원래 상태 ${realStatus})`);
  }

  try {
    // 겹치는 사람이 가장 많은 더미를 주인공으로 삼는다 — 화면이 가장 풍성하다.
    const me = psql(`SELECT ui.user_id FROM user_interest ui JOIN interest i ON i.id=ui.interest_id JOIN category c ON c.id=i.category_id AND c.kind='INTEREST' WHERE ui.user_id LIKE '%' GROUP BY ui.user_id ORDER BY count(*) DESC, sum(i.holder_count) DESC LIMIT 1`);
    const others = psql(`SELECT id FROM "user" WHERE status='ACTIVE' AND id<>'${me}' ORDER BY random() LIMIT 5`).split('\n').filter(Boolean);
    console.log(`주인공 ${psql(`SELECT COALESCE(nickname, real_name) FROM "user" WHERE id='${me}'`)}\n`);

    buildStates(me, others);
    psql("UPDATE feature_flag SET enabled=true WHERE key='network_enabled'");
    cookie = `sn_session=${jwt.sign({ sub: me }, secret, { expiresIn: '365d' })}`;

    console.log('기본 화면 캡처');
    await grab('/parameters');
    await grab('/me');
    await grab('/interests');
    await grab('/me/posts');
    await grab('/notifications');
    await grab('/notifications/badge');
    await grab('/follow-ups/pending');
    await grab('/connections');
    await grab('/connection-requests?box=received');
    await grab('/connection-requests?box=sent');
    await grab('/recommendations/similar-people');

    console.log('그래프 캡처');
    const graph = await grab('/graph?anchor=me');
    await grab('/graph/similar');

    console.log('패널 캡처 (그래프에 뜨는 노드 전부)');
    const interestIds = graph.nodes.filter((n) => n.kind === 'INTEREST').map((n) => n.id);
    const personIds = graph.nodes.filter((n) => n.kind === 'PERSON' && n.id !== me).map((n) => n.id);
    for (const id of interestIds) {
      await grab(`/interests/${id}`);
      await grab(`/graph?anchor=interest&interestId=${id}`);
    }
    for (const id of personIds) await grab(`/users/${id}`);

    console.log('연결 상세 캡처');
    const connections = fixtures['/connections'] ?? [];
    for (const item of Array.isArray(connections) ? connections : connections.items ?? []) {
      await grab(`/connections/${item.id}`);
    }

    console.log('관심사 추가 중복 검사 캡처');
    for (const q of ['리엑트', '러스트', '보드게임', '스프링']) {
      await grab(`/interests/similar?q=${encodeURIComponent(q)}`);
    }

    console.log('네트워크 캡처');
    // 데모용 추천 하나를 직접 만든다 (후보 계산 결과는 매번 달라진다)
    const members = [me, ...others.slice(0, 3)];
    const common = psql(`SELECT COALESCE(string_agg(quote_literal(t.id), ','), '') FROM (SELECT i.id FROM interest i JOIN category c ON c.id=i.category_id AND c.kind='INTEREST' ORDER BY i.holder_count DESC LIMIT 5) t`);
    psql(`INSERT INTO network_recommendation (id, member_set_hash, common_interest_ids, size, status, exposed_at, expires_at) VALUES (gen_random_uuid(), 'demo-open', ARRAY[${common}]::text[], ${members.length}, 'OPEN', now() - interval '1 day', now() + interval '2 days')`);
    const openId = psql("SELECT id FROM network_recommendation WHERE member_set_hash='demo-open'");
    for (const m of members) psql(`INSERT INTO network_member (recommendation_id, user_id, decision) VALUES ('${openId}', '${m}', 'PENDING')`);
    psql(`UPDATE network_member SET decision='JOINED', decided_at=now(), join_order=1 WHERE recommendation_id='${openId}' AND user_id='${others[0]}'`);

    for (const tab of ['recommended', 'joined', 'activated']) await grab(`/networks?tab=${tab}`);
    await grab(`/networks/${openId}`);

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(fixtures, null, 0));

    const size = (fs.statSync(OUT).size / 1024).toFixed(0);
    console.log(`\n${Object.keys(fixtures).length}개 응답 · ${size}KB → web/src/mocks/fixtures.json`);

    // 개인정보 점검: 실제 계정의 흔적이 남았는지
    const raw = fs.readFileSync(OUT, 'utf8');
    const leaks = [realId, '최준환', 'devjunsday', '어흥데이터반'].filter((t) => t && raw.includes(t));
    console.log(leaks.length ? `⚠ 실제 계정 흔적 발견: ${leaks.join(', ')}` : '실제 계정 흔적 없음 ✓');
  } finally {
    if (realId) {
      psql(`UPDATE "user" SET status='${realStatus}' WHERE id='${realId}'`);
      psql("UPDATE feature_flag SET enabled=false WHERE key='network_enabled'");
      console.log('실제 계정 상태와 network_enabled 복원');
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });

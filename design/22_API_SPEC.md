# 22. API Specification

| 항목 | 내용 |
|---|---|
| 문서 상태 | Draft v0.1 (Phase 3, API) |
| 작성일 | 2026-09-08 |
| 선행 문서 | 20_ARCHITECTURE, 21_ERD |
| 형식 | REST / JSON. Base path `/api`. 인증은 httpOnly 세션 쿠키 |

각 엔드포인트에 **어떤 정책을 강제하는지**를 함께 적었다. 정책 없이 있는 엔드포인트는 없다.

---

## 1. 공통 규약

### 1.1 인증과 접근 단계

| 단계 | 접근 가능 | 아니면 |
|---|---|---|
| 비로그인 | `/api/invites/:code`, `/api/auth/*`, `/api/parameters` | `401 UNAUTHENTICATED` |
| 로그인 + 온보딩 미완료 | `/api/me`, `/api/onboarding/*`, `/api/interests`(목록), `/api/me/interests` | `403 ONBOARDING_REQUIRED` + `{ step }` |
| 온보딩 완료 | 전부 | — |
| 요청 권한 정지 | 요청 생성만 차단 | `403 REQUEST_SUSPENDED` |
| 운영자 | `+ /api/admin/*` | `403 FORBIDDEN` |

온보딩 미완료자는 그래프·추천·다른 사용자 조회에 접근할 수 없고 **다른 사람에게도 보이지 않는다**(FR-1.6). 가드 하나로 강제한다.

### 1.2 오류 형식

```json
{ "code": "REQUEST_LIMIT_REACHED", "message": "오늘 보낼 수 있는 요청을 모두 사용했습니다.", "details": { "resetAt": "2026-09-09T00:00:00+09:00" } }
```

`message`는 **화면에 그대로 쓸 수 있는 한국어**다. 06 §4의 문구를 서버가 갖는다. 프론트가 코드별로 문구를 다시 만들면 문구가 갈라진다.

| code | HTTP | 쓰이는 곳 |
|---|---|---|
| `UNAUTHENTICATED` | 401 | 세션 없음/만료 |
| `INVITE_REQUIRED` | 403 | 초대 없이 신규 가입 시도 (FR-0.2) |
| `ONBOARDING_REQUIRED` | 403 | 온보딩 미완료 |
| `REQUEST_SUSPENDED` | 403 | 요청 권한 정지 (09 §9) |
| `INTEREST_COUNT_MIN` / `INTEREST_COUNT_MAX` | 400 | P-01 / P-02 위반 |
| `NICKNAME_TAKEN` / `NICKNAME_LOOKS_LIKE_REAL_NAME` / `NICKNAME_INVALID` | 400 | 12 §3 |
| `NICKNAME_CHANGE_TOO_SOON` | 400 | 하루 1회 (12 §3) |
| `REQUEST_LIMIT_REACHED` | 429 | P-06 일/주 상한 |
| `REQUEST_ALREADY_EXISTS` | 409 | 진행 중 요청 |
| `REQUEST_INCOMING_EXISTS` | 409 | 상대가 먼저 요청함 → 수락 유도 (09 §2) |
| `REQUEST_COOLDOWN` | 409 | P-07 재요청 대기 |
| `ALREADY_CONNECTED` | 409 | — |
| `ALREADY_HANDLED` | 409 | 이미 처리된 요청/추천 (07 §6) |
| `UNDO_WINDOW_PASSED` | 409 | 거절 되돌리기 5초 경과 |
| `POST_LIMIT_REACHED` | 429 | 관심사당 하루 1 / 전체 하루 3 (11 §2) |
| `POST_INTEREST_NOT_OWNED` | 403 | 관심사 미보유자 작성 (FR-6.1) |
| `NETWORK_SLOT_FULL` | 409 | 동시 노출 3개 (10 §2a) |
| `NETWORK_DISABLED` | 404 | 게이트 미통과 (10 §4) |
| `NOTIFICATION_CHANNEL_REQUIRED` | 400 | 받은 요청 알림 전부 끄기 시도 (FR-14.5) |

### 1.3 페이지네이션과 시간

- 커서 방식: `?cursor=<opaque>&limit=20` → `{ "items": [...], "nextCursor": "..." | null, "total": 42 }`
- `total`은 "N명 더 있음"(06 §2) 표시에 필요한 곳에만 넣는다.
- 모든 시각은 ISO 8601(UTC). 하루 단위 판정 기준은 서버의 `Asia/Seoul`이다(T-11).

### 1.4 파라미터 조회

```
GET /api/parameters
```

```json
{
  "parameters": { "P-01": 5, "P-02": 15, "P-03": 3, "P-16": 200, "P-17": 300, "...": 0 },
  "features": { "network_enabled": false }
}
```

프론트는 "최소 5 · 최대 15" 같은 문구를 **이 응답으로 만든다**(20 §9). 비로그인에서도 접근 가능하다(온보딩 소개 화면에 필요).

---

## 2. 사용자 표현 — 실명이 나갈 수 있는 곳

세 가지 형태만 존재한다(20 §11). 다른 조합은 만들지 않는다.

```jsonc
// PublicUser — 연결 전 모든 조회의 기본형
{
  "id": "u_...",
  "displayName": "달리기왕",
  "displayNameType": "NICKNAME",        // 또는 "REAL" (실명 표시가 붙는다, FR-0.5)
  "interests": [{ "id": "i_...", "name": "러닝", "categoryId": "c_...", "isCommon": true }],
  "commonCount": 4,
  "relation": {
    "status": "NONE",                    // NONE | REQUEST_SENT | REQUEST_RECEIVED | CONNECTED | NO_RESPONSE | SELF
    "requestId": null,
    "reRequestableAt": null              // NO_RESPONSE일 때만
  },
  "recentPosts": [ /* 최신 3개, S1 */ ]
}

// ConnectedUser — 연결됨 상태의 상대, 성립 Network 멤버, 나 자신에게만
{ "...PublicUser": "...", "realName": "김지수_서울_18반" }

// SelfUser — 나에게만
{ "...ConnectedUser": "...", "email": "me@example.com", "isOperator": false,
  "status": "ACTIVE", "requestSuspended": false }
```

| 규칙 | 내용 |
|---|---|
| `realName` 키의 존재 자체가 권한이다 | 연결 전 응답에는 이 키가 **없다**. `null`도 아니다 |
| `relation.status`에 `REJECTED`는 없다 | 거절은 보낸 사람에게 `REQUEST_SENT` → (최대 하루 뒤) `NO_RESPONSE`로만 보인다(09 §6, 21 §4.1) |
| 연결 수, 연결 상대 목록 | 어떤 응답에도 없다(12 §5) |
| 탈퇴한 사용자 | `{ "id": "...", "displayName": "탈퇴한 사용자", "withdrawn": true }`. 관심사·글·실명 없음 |

---

## 3. 인증 · 초대 · 온보딩

```
GET  /api/invites/:code                 초대 링크 유효성 (비로그인)
GET  /api/auth/google?redirect=/...     302 → Google
GET  /api/auth/google/callback          302 → redirect 또는 온보딩 재개 지점
POST /api/auth/logout
GET  /api/me                            SelfUser + 온보딩 상태
```

`GET /api/invites/:code` → `{ "valid": true }`. 유효하면 서명된 초대 쿠키(10분)를 함께 심는다. 신규 사용자는 콜백에서 이 쿠키가 없으면 `INVITE_REQUIRED`로 막힌다(FR-0.2).

### 온보딩 (J0, 06 §3.1)

```
GET   /api/onboarding/state
POST  /api/onboarding/identity          { "realName": "최준환", "classNo": "18반" }
GET   /api/onboarding/nickname-check?value=달리기왕
POST  /api/onboarding/display-name      { "type": "NICKNAME", "nickname": "달리기왕" }
PUT   /api/me/interests                 { "interestIds": ["i_...", "..."] }
POST  /api/onboarding/notifications     { "email": true, "webPush": true }
```

| 엔드포인트 | 강제하는 정책 |
|---|---|
| `identity` | 이름·반을 따로 받아 `이름_캠퍼스_반`으로 조합해 미리보기를 돌려준다(D-47). 검증은 하지 않는다(12 §2) |
| `nickname-check` | 중복, **다른 구성원의 실명과 완전 일치 또는 한 글자 차이**, 부적절 표현, 2~12자 (12 §3, D-49) |
| `display-name` | `type=REAL`이면 `nickname`은 무시하고 null로 둔다 |
| `PUT /me/interests` | `[P-01]` 이상 `[P-02]` 이하. 미만이면 `INTEREST_COUNT_MIN`. 저장 시 `UserInterestChange` 기록, `holderCount` 갱신 |
| `notifications` | 마지막 단계. 성공 시 `status=ACTIVE`, `onboardedAt` 기록 → **Network 후보 계산 + 최선 1개 즉시 노출**(10 §2a) |

`GET /api/onboarding/state` → `{ "step": "INTERESTS" }`. 중단 후 재진입 시 이 값으로 이어서 시작한다(J0 Failure State).

---

## 4. 관심사

```
GET  /api/interests                          Category별 전체 목록 (온보딩·수정 화면)
GET  /api/interests/:id                      관심사 상세 패널
GET  /api/interests/:id/people?cursor        관심사 보유자 목록
GET  /api/interests/:id/posts?cursor         관심사 글 (S1)
POST /api/me/interests/:id                   내 관심사에 하나 추가 (06 §3.3 버튼)
DELETE /api/me/interests/:id                 하나 제거
```

`GET /api/interests` 응답:

```json
{
  "categories": [
    { "id": "c_dev", "name": "개발", "interests": [
      { "id": "i_be", "name": "백엔드", "holderCount": 312, "mine": true, "status": "ACTIVE" }
    ]}
  ],
  "selectedCount": 7, "min": 5, "max": 15
}
```

- `holderCount`를 보여주는 것은 "여기 고르면 누가 있을지"의 힌트다(06 §3.1.4).
- `status=HIDDEN`인 관심사는 **이미 가진 사람에게만** 목록에 나오고 "숨겨진 관심사"로 표시된다(08 §5).
- 관심사 목록에는 사람 이름이 없다. 검색은 관심사 이름 대상이며 **사람 이름 검색은 없다**(L3).

`GET /api/interests/:id` 응답: 이름, Category, `holderCount`, `mine`, `peopleTotal`, 상위 사람 20명(공통 많은 순), 최근 글 5개, `canPost`(내가 이 관심사를 가졌는가, FR-6.1).

---

## 5. 그래프

```
GET /api/graph?anchor=me
GET /api/graph?anchor=interest&interestId=i_be
GET /api/graph/similar
GET /api/graph/network/:recommendationId          (S2)
```

공통 응답:

```json
{
  "anchor": { "type": "ME" },
  "nodes": [
    { "id": "u_me", "kind": "ME" },
    { "id": "u_1", "kind": "PERSON", "displayName": "민수", "displayNameType": "REAL",
      "commonCount": 4, "relation": "NONE" },
    { "id": "i_be", "kind": "INTEREST", "name": "백엔드", "categoryId": "c_dev",
      "mine": true, "holderCount": 312 },
    { "id": "i_ml", "kind": "INTEREST", "name": "AI", "categoryId": "c_dev",
      "mine": false, "adjacent": true, "holdersInGraph": 6 },
    { "id": "n_1", "kind": "NETWORK_HUB", "commonInterestIds": ["i_be", "..."] }
  ],
  "links": [
    { "source": "u_1", "target": "i_be", "kind": "HAS_INTEREST" },
    { "source": "u_me", "target": "u_1", "kind": "SIMILARITY", "commonCount": 4,
      "commonInterestIds": ["i_be", "i_oss", "i_run", "i_read"] },
    { "source": "n_1", "target": "u_1", "kind": "HUB_MEMBER" }
  ],
  "truncated": { "people": 12, "interests": 0 }
}
```

| 규칙 | 근거 |
|---|---|
| 노드 종류 4개 (`ME`, `PERSON`, `INTEREST`, `NETWORK_HUB`), 선 종류 3개 (`HAS_INTEREST`, `SIMILARITY`, `HUB_MEMBER`) | 06 §2 시각 부호화 |
| `adjacent: true`가 인접 관심사(계층 3) 표시 | 06 §2 "내 관심사와 구분" |
| `truncated`는 항상 응답에 있다 | 06 §2 "N명 더 있음"은 항상 보인다 |
| 사람 노드는 **표시된 관심사에만** 선이 그어진다 | 06 §1.1 |
| `SIMILARITY` 링크에 공통 관심사 이름 전부 | 13 §5, FR-8.2 (hover에 전부 보여야 한다) |
| 점수·유사도 필드 없음 | D-51 |
| 좌표 없음 | 배치는 클라이언트 힘 기반 레이아웃이 정한다. 저장하지 않는다(07 §2.15) |

- `anchor=interest`: 그 관심사 + 보유자 `[P-13]`명 + 그들의 다른 관심사 `[P-14]`개. **나는 항상 남는다**(06 §1.1).
- `anchor=me`의 계층 2 구성 절차(관심사당 최소 2명 보정)는 20 §6.1.
- Person Focus의 임시 확장(06 §1.1)은 **클라이언트가 하지 않는다.** `GET /api/users/:id`가 그 사람의 관심사 전부를 주므로 프론트가 그래프에 임시 노드를 얹는다. 서버 왕복을 늘리지 않기 위해서다.
- `GET /api/graph/similar`: 나 + 상위 `[P-15]` 10명 + `SIMILARITY` 링크. 목록 전체는 §6.
- `GET /api/graph/network/:id`: 허브 노드 1개 + 멤버 선만. **멤버 간 선과 멤버–관심사 선은 응답에 없다**(D-27).

---

## 6. Similar People

```
GET /api/recommendations/similar-people?cursor=&limit=20&filter=all|new_only
```

```json
{
  "criterion": { "minCommon": 3, "sortBy": "공통 관심사가 많은 순, 같으면 드문 관심사를 공유하는 순" },
  "total": 34,
  "items": [
    { "user": { "...PublicUser": "..." },
      "commonInterests": [{ "id": "i_be", "name": "백엔드" }],
      "commonCount": 4,
      "inGraph": true }
  ],
  "hiddenCount": 2
}
```

| 규칙 | 근거 |
|---|---|
| `criterion`을 서버가 문장으로 준다 | 13 원칙 4 "정렬 기준도 설명한다". 화면 상단에 그대로 쓴다 |
| 공통 관심사 **이름 전부** | 13 원칙 3 "이유는 완전하다". 일부만 주지 않는다 |
| 점수·퍼센트 없음 | 13 원칙 2 |
| 이미 연결·요청 중인 사람도 목록에 남는다 | 13 §3.4. `relation`으로 구분하고 `filter=new_only`로 거를 수 있다 |
| 내가 거절한 사람은 숨김 | 13 §3.4. `hiddenCount`로 개수만 알리고 "숨긴 사람 보기"는 `?includeHidden=true` |
| 나를 거절한 사람은 남는다 | `relation.status=NO_RESPONSE` + `reRequestableAt` |
| 정지·온보딩 미완료·탈퇴자 제외 | 13 §3.4 |

---

## 7. 사람 조회

```
GET /api/users/:id            Person Profile (06 §3.4)
GET /api/users/:id/posts      그 사람의 글 (S1, 최신 3)
```

응답은 §2의 `PublicUser` 또는 `ConnectedUser`(연결됨일 때). `relation.status`에 따라 프론트가 **행동 하나만** 보여준다(06 §3.4 표).

| status | 화면의 행동 |
|---|---|
| `NONE` | "연결 요청" + 남은 횟수 |
| `REQUEST_SENT` | "요청 보냄 · 응답 대기" + 취소 |
| `REQUEST_RECEIVED` | "수락" / "거절" |
| `CONNECTED` | "연결됨" + 성립 화면 열기 |
| `NO_RESPONSE` | "응답 없음 · N일 후 다시 요청 가능" |
| `SELF` | "관심사 수정" |

---

## 8. 연결 (1:1)

### 8.1 요청 보내기

```
GET  /api/me/request-quota
POST /api/connection-requests
```

```json
// POST 본문
{ "targetId": "u_1", "message": "러닝 얘기 나누고 싶어서요.", "entryPoint": "SIMILAR" }
```

```json
// GET /api/me/request-quota
{ "dailyLimit": 5, "dailyUsed": 2, "weeklyLimit": 20, "weeklyUsed": 7,
  "throttled": false, "resetAt": "2026-09-09T00:00:00+09:00" }
```

서버가 순서대로 확인한다.

1. 정지 여부 → `REQUEST_SUSPENDED` (09 §9)
2. 자기 자신 → 400
3. 이미 연결됨 → `ALREADY_CONNECTED`
4. 내 PENDING 요청 존재 → `REQUEST_ALREADY_EXISTS`
5. 상대의 PENDING 요청 존재 → `REQUEST_INCOMING_EXISTS` (수락으로 유도, 09 §2)
6. 재요청 대기 중 → `REQUEST_COOLDOWN` + `reRequestableAt` (P-07 14일, 취소는 다음 날부터)
7. 상한 → `REQUEST_LIMIT_REACHED` (KST 달력 하루 5 / 달력 주 20, 취소 포함)
8. 감속 조건 → 일 상한 2로 낮춰 다시 7번 (09 §3)
9. 메시지 1자 이상 `[P-16]` 200자 이하 → 400
10. 동일 메시지 3회 → 막지 않고 응답에 `warning: "각 사람에게 맞는 메시지를 써보세요"` (09 §3)

**공통 관심사 0개여도 통과한다**(09 §2). 요청 시점의 공통 관심사를 `commonInterestIds`에 고정한다(08 §3).

성공 시 상대에게 즉시 알림(`CONNECTION_REQUEST_RECEIVED`, 표시명·공통 관심사·메시지 첫 줄 포함, 12 §7).

### 8.2 요청 처리

```
GET    /api/connection-requests?box=received|sent&cursor=
GET    /api/connection-requests/:id            (수신자가 열면 readAt 기록)
POST   /api/connection-requests/:id/accept
POST   /api/connection-requests/:id/reject
POST   /api/connection-requests/:id/reject/undo     5초 이내 (07 §3.4)
DELETE /api/connection-requests/:id                 취소 (S6)
```

| 동작 | 규칙 |
|---|---|
| 목록(received) | PENDING만. 거절·만료된 것은 사라진다(09 §7) |
| 목록(sent) | 상태를 §2 규칙으로 가공. `REJECTED`는 시간이 되기 전까지 `PENDING`으로 보인다 |
| accept | 트랜잭션: 요청 `ACCEPTED` → `Connection` 생성(`initiatorId = requesterId`, D-15) → 역방향 PENDING 요청이 있으면 함께 정리하고 **먼저 보낸 쪽이 시작자**(07 §3.3) → 양쪽 알림 → 관련 알림 `resolvedAt` |
| accept 응답 | 연결 성립 화면에 필요한 전부를 한 번에 준다(§8.3). 화면 전환에 추가 호출이 없어야 한다(07 §3.3 "페이지 이동 없음") |
| reject | 상대에게 알림 **없음**(D-07). 5초 되돌리기를 위해 응답에 `undoUntil` |
| cancel | 상대의 받은 요청에서 조용히 사라진다. **횟수는 복구하지 않는다**(09 §8) |

### 8.3 연결

```
GET  /api/connections?cursor=
GET  /api/connections/:id
POST /api/connections/:id/mark-started
```

```json
// GET /api/connections/:id — 연결 성립 Overlay (06 §3.12)
{
  "id": "cn_1",
  "counterpart": { "id": "u_1", "displayName": "지수", "realName": "김지수_서울_18반",
                   "interests": [], "recentPosts": [] },
  "commonInterests": [{ "id": "i_run", "name": "러닝" }],
  "requestMessage": "러닝 얘기 나누고 싶어서요.",
  "establishedAt": "2026-09-08T02:10:00Z",
  "myRole": "INITIATOR",
  "action": {
    "text": "최준환님, 사내 메신저에서 김지수님을 찾아 첫 메시지를 보내주세요.",
    "copyText": "김지수_서울_18반",
    "buttonLabel": "메신저에서 메시지를 보냈어요"
  },
  "started": false
}
```

| 규칙 | 근거 |
|---|---|
| `action.text`를 **서버가 완성해서 준다** | FR-11.3/NFR-3a. "누가 누구에게"가 화면마다 달라지면 안 된다 |
| 상대에게는 `myRole=COUNTERPART`, 문구는 "○○님이 먼저 연락할 예정입니다. 먼저 연락하셔도 좋습니다" | 09 §5 |
| `commonInterests`는 **현재 기준** | 08 §3 |
| 첫 메시지 문안은 만들지 않는다 | L5. 소재(공통 관심사, 상대 최근 글)만 준다 |
| `mark-started`는 상대에게 알리지 않는다 | 07 §3.6 |
| 연결 해제 엔드포인트 없음 | D-42 |

### 8.4 후속 확인 (M14)

```
GET  /api/follow-ups/pending
POST /api/follow-ups/:id/respond
```

```json
{ "started": false, "reason": "NOT_FOUND", "askCounterpart": true }
```

- 성립 후 `[P-18]` 2일에 배치가 생성하고 알림을 보낸다. **1회만**(스키마 유니크로 보장, 21 §4.3).
- `reason=NOT_FOUND` + `askCounterpart=true`면 상대에게 `CONNECTION_ASK_COUNTERPART` 알림(09 §10).
- 응답은 이 서비스에서 H5를 측정하는 **유일한 신호**다(D-08).

---

## 9. Network (S2)

`network_enabled` 플래그가 꺼져 있으면 이 아래 전부 `404 NETWORK_DISABLED`이고, 전역 내비에서도 사라진다(10 §4).

```
GET  /api/networks?tab=recommended|joined|activated&cursor=
GET  /api/networks/:id
POST /api/networks/:id/join
POST /api/networks/:id/leave        참여 철회 (성립 전)
POST /api/networks/:id/decline
POST /api/networks/:id/mark-invited
```

```json
// GET /api/networks/:id
{
  "id": "nr_1",
  "reason": "이 4명은 관심사 5개를 모두 공유합니다",
  "commonInterests": [{ "id": "i_be", "name": "백엔드" }],
  "members": [
    { "user": { "...PublicUser": "..." }, "decision": "JOINED", "joinOrder": 1 }
  ],
  "joinedCount": 2, "requiredCount": 3,
  "expiresAt": "2026-09-11T00:00:00Z",
  "status": "OPEN",
  "myDecision": "PENDING",
  "wouldBeInitiator": true,
  "snapshotNote": "추천 당시 기준"
}
```

| 규칙 | 근거 |
|---|---|
| `reason` 문장을 서버가 완성 | 13 §4 "이 N명은 관심사 K개를 모두 공유합니다" + 이름 전부 |
| `wouldBeInitiator` | 참여 전 확인 문구를 띄우기 위해(07 §4.1) |
| 거절한 멤버는 `members`에 없다 | 06 §3.6 |
| 성립 전에는 실명 없음, 성립 후 **참여자만** `realName` | 12 §6 |
| `join`이 `[P-09]` 3명째면 즉시 `ACTIVATED` | D-44. 나머지 결정을 기다리지 않는다 |
| `leave`로 첫 참여자가 빠지면 시작자 이관 | 10 §5 |
| 만료 시 인원 미달 | `NETWORK_FAILED` 알림 + 참여자끼리 1:1 요청 진입점(10 §6) |
| 같은 멤버 집합 재추천 없음 | 10 §7. 스키마 유니크로 보장 |
| Network 탈퇴 엔드포인트 없음 | 10 §8 |

---

## 10. 게시글 (S1)

```
POST   /api/posts             { "interestId": "i_be", "content": "..." }
DELETE /api/posts/:id
```

- 작성 자격: 그 관심사 보유자만(FR-6.1). 아니면 `POST_INTEREST_NOT_OWNED`.
- 길이 `[P-17]` 300자, 관심사 하나(11 §2).
- 횟수: 관심사당 하루 1개, 전체 하루 3개 → `POST_LIMIT_REACHED`.
- 수정 없음(11 §3). 삭제는 작성자와 운영자.
- 목록은 §4(관심사 상세)와 §7(사람)에만 있다. **전체 피드와 검색 엔드포인트를 만들지 않는다**(D-46).

---

## 11. 알림

```
GET  /api/notifications?cursor=
GET  /api/notifications/badge
POST /api/notifications/:id/read
GET  /n/:deliveryId                     (API 아님. 302 리다이렉트)
```

```json
// GET /api/notifications/badge
{ "count": 3, "breakdown": { "receivedRequests": 2, "unseenConnections": 1, "followUps": 0 } }
```

- **배지는 처리가 필요한 것의 수다**(D-31). 미읽음 수가 아니다. 0이면 할 일이 없다는 뜻이어야 한다.
- 알림 항목에는 판단 근거(표시명, 공통 관심사 개수와 이름, 메시지 첫 줄)가 들어간다(FR-14.3).
- **알림에 수락/거절 같은 행동 필드를 넣지 않는다**(D-25). `targetPath`만 준다.
- `/n/:deliveryId`: 클릭 기록 → 로그인 확인(없으면 `?redirect=`로 OAuth) → `targetPath`로 302. 대상이 이미 처리됐으면 "이미 처리된 항목입니다" 화면으로(07 §6).

---

## 12. 내 프로필과 설정

```
GET    /api/me/preview                       "연결 전 / 연결 후" 미리보기 (06 §3.10)
PATCH  /api/me/display-name                  { "type": "REAL" } | { "type": "NICKNAME", "nickname": "..." }
PATCH  /api/me/real-name                     { "realName": "최준환", "classNo": "18반" }
PUT    /api/me/interests                     관심사 저장 (온보딩과 같은 엔드포인트, D-24)
GET    /api/me/notification-settings
PUT    /api/me/notification-settings
POST   /api/me/push-subscriptions            { endpoint, keys }
DELETE /api/me/push-subscriptions/:id
POST   /api/me/external-channels             (S3a, B-4 확인 후)
DELETE /api/me                               탈퇴
```

| 규칙 | 근거 |
|---|---|
| 표시명 변경은 하루 1회 | 12 §3 |
| 관심사 저장 응답에 "그래프와 추천이 바뀝니다" 신호 | 07 §5, NFR-5 |
| 받은 요청 알림을 모든 채널에서 끄려 하면 거부 | FR-14.5 → `NOTIFICATION_CHANNEL_REQUIRED` |
| 탈퇴는 21 §11의 트랜잭션 | 12 §10 |

---

## 13. 제안과 신고

```
GET  /api/interest-suggestions/similar?q=클라이밍       비슷한 기존 관심사 (08 §4)
POST /api/interest-suggestions                          { "name": "볼더링" }
POST /api/reports                                       { "targetType": "POST", "targetId": "...", "reason": "...", "detail": "..." }
```

신고 응답은 `{ "accepted": true }`뿐이다. **결과를 통보하지 않는다**(09 §9). 차단 엔드포인트는 없다(D-48).

---

## 14. 측정

```
POST /api/events
{ "events": [ { "name": "graph.interest_click", "props": { "adjacent": true }, "occurredAt": "..." } ] }
```

14 §6의 목록을 이름으로 고정한다. 서버가 아는 사건(요청 발송·수락·거절·만료·성립·참여)은 **서버가 직접 기록하고 프론트가 보내지 않는다**(20 §10).

| 영역 | 이벤트 이름 |
|---|---|
| 온보딩 | `onboarding.invite_open` `onboarding.login` `onboarding.identity` `onboarding.display_name` `onboarding.interests_saved` `onboarding.notification_setup` `onboarding.completed` |
| 그래프 | `graph.view` `graph.interest_click` `graph.person_click` `graph.anchor_change` `graph.similar_mode` `graph.network_mode` `graph.background_click` `graph.more_click` |
| 프로필 | `profile.view` `profile.request_button` |
| 요청 | (서버) `request.sent` `request.read` `request.accepted` `request.rejected` `request.expired` `request.cancelled` `request.reminder_sent` |
| 연결 | (서버) `connection.established` `connection.marked_started` `connection.initiator_reminded` |
| 후속 확인 | (서버) `followup.asked` `followup.responded` |
| Network | (서버) `network.candidates_computed` `network.exposed` `network.joined` `network.declined` `network.activated` `network.expired` / (프론트) `network.card_view` |
| 글 | `post.created` `post.impression` `post.author_click` |
| 알림 | (서버) `notification.sent` `notification.clicked` / (프론트) `notification.settings_changed` |
| 관심사 | `interest.changed` `interest.suggested` |
| 신고 | (서버) `report.created` `report.resolved` |

---

## 15. 운영자 (UI 없음, L6)

```
GET  /api/admin/networks/gate                1인당 후보 수와 게이트 판정 (10 §4)
POST /api/admin/networks/recompute           후보 풀 전체 재계산
POST /api/admin/networks/expose              빈 슬롯에 우선순위 순 노출
GET  /api/admin/metrics/funnel?from=&to=     14 §2 요약
GET  /api/admin/reports?status=OPEN
POST /api/admin/reports/:id/resolve          { "action": "DELETE_POST" | "SUSPEND_REQUEST" | "DISMISS", "note": "" }
POST /api/admin/users/:id/suspend            { "suspended": true, "reason": "" }
GET  /api/admin/interest-suggestions?status=PENDING
POST /api/admin/interest-suggestions/:id/resolve
POST /api/admin/interests                    추가
PATCH /api/admin/interests/:id               이름 변경 / 숨김 / 병합 (08 §5)
PUT  /api/admin/parameters/:key              { "value": 2, "reason": "추천 0명 비율 34%" }
PUT  /api/admin/feature-flags/:key           { "enabled": true }
```

- 화면은 만들지 않는다(L6). 운영자는 이 엔드포인트를 직접 호출하거나 `api/scripts/`의 SQL을 쓴다.
- 병합·숨김은 영향받은 사용자에게 알림을 동반한다(08 §5).
- 파라미터 변경은 `AppParameterChange`에 이유와 함께 남는다(20 §9).
- 운영자는 신고 없이 요청 메시지를 열람하지 않는다 — **정책적 약속이며 기술적 차단은 아니다**(12 §9). 엔드포인트에도 그렇게 적어 둔다.

---

## 16. 화면 ↔ API 매핑

| 화면 (05, 06) | 호출 |
|---|---|
| 초대/소개 | `GET /api/invites/:code`, `GET /api/parameters` |
| 온보딩 5단계 | §3 |
| Graph 홈 | `GET /api/graph?anchor=me`, `GET /api/notifications/badge` |
| 패널: Interest 상세 | `GET /api/interests/:id` (+ people/posts 더 보기) |
| 패널: Person Profile | `GET /api/users/:id` |
| 패널: Similar People | `GET /api/graph/similar` + `GET /api/recommendations/similar-people` |
| 패널: Network 상세 | `GET /api/graph/network/:id` + `GET /api/networks/:id` |
| Connections 3탭 | `GET /api/connection-requests?box=`, `GET /api/connections` |
| Networks 3탭 | `GET /api/networks?tab=` |
| Notifications | `GET /api/notifications` |
| My Profile | `GET /api/me/preview`, `PUT /api/me/interests` |
| Settings | `GET/PUT /api/me/notification-settings` |
| Overlay 요청 작성 | `GET /api/me/request-quota` → `POST /api/connection-requests` |
| Overlay 요청 상세 | `GET /api/connection-requests/:id` → accept/reject |
| Overlay 연결 성립 | `GET /api/connections/:id` → `mark-started` |
| Overlay Network 성립 | `GET /api/networks/:id` → `mark-invited` |
| Overlay 후속 확인 | `GET /api/follow-ups/pending` → `respond` |
| Overlay 글 작성 | `POST /api/posts` |
| Overlay 관심사 제안 | `GET /api/interest-suggestions/similar` → `POST` |
| Overlay 신고 | `POST /api/reports` |

Must 화면 전부가 위에 있다. **여기 없는 엔드포인트는 만들지 않는다.**

---

## 17. 만들지 않는 엔드포인트

| 없음 | 이유 |
|---|---|
| 사람 이름 검색 | Non-Goal (L3) |
| 전체 피드 / 글 검색 | D-46 |
| 차단 | D-48 |
| 연결 해제 | D-42 |
| 좋아요·댓글 | D-46 |
| 추천 숨기기·새로고침 주기 | L9 |
| 전체 조직 그래프 | D-05 |
| 사용자별 연결 수 조회 | 12 §5 |
| 알림에서 바로 수락 | D-25 |

---

## 18. 남은 결정

| 항목 | 언제 |
|---|---|
| OpenAPI 문서 생성 여부(@nestjs/swagger) | 구현 단계. 1인 개발이라 필수는 아니나 프론트 클라이언트 생성에 유용 |
| 알림 실시간 반영 방식(폴링 60초 vs SSE) | M4. 기본은 폴링 |
| `entryPoint` 값의 최종 목록 | M3. 14 §2.3의 진입점 분포와 맞춘다 |
| S3a 외부 채널의 요청/응답 형태 | B-4 결과 확인 후 |

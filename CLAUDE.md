# SSAFY Connection (ssafy-net)

관심사 그래프 기반 네트워킹 서비스. 단일 캠퍼스 약 1,000명 대상. Discover → Understand → Connect, 대화는 사내 메신저(Mattermost)에서 실명으로.

> 서비스명은 **SSAFY Connection**(D-70). 표시 문자열은 `packages/shared/src/brand.ts`의 `SERVICE_NAME` 하나에서 나온다. 정적 HTML인 `web/index.html` 제목만 따로 적혀 있다.

## 현재 상태 (2026-09-08)

**MVP 기능 구현 완료.** Must(M0~M14)와 Should가 모두 돌아간다.

| 마일스톤 | 범위 | 상태 |
|---|---|---|
| M1 기반 | 스키마 24모델, 인증·초대, 온보딩 | 완료 |
| M2 발견 | 그래프, Interest/Person 패널, Similar People | 완료 |
| M3 연결 | 요청·수락·거절·만료, Connections, 성립 화면, 후속 확인 | 완료 |
| M4 알림 | Mattermost 발송, 알림함, 딥링크, 배치 10종 | 완료 |
| M5 Should | Network 추천, Interest Post, 묶음 알림, 관심사 직접 추가(D-74, 제안 대체) | 완료 |

**로컬에서 로그인·온보딩이 끝까지 돈다.** 실제 Google 계정으로 가입해 그래프까지 확인했다.

**성능은 병목이 아니다.** 더미 1,006명으로 실측했고 숫자는 `design/20 §13`에 있다. 그래프 응답은 표시 상한 때문에 인원수와 무관하고(19ms), 권장 사양은 2 vCPU · 4GB다.

### 남은 것 (권하는 순서)

| 순서 | 항목 | 왜 지금인가 |
|---|---|---|
| 1 | **알림 발송의 동시성 상한 + 재시도** | 묶음 알림이 1,000명에게 나가면 웹훅 호출 1,000건이 동시에 튄다. 실패는 재시도되지 않는다(design/20 §13) |
| 2 | **운영자 레버** — 사용자 정지, 관심사 병합·숨김 | 신고를 없애(D-69) 정지가 유일한 안전장치인데 엔드포인트가 없다. 직접 추가(D-74) 때문에 병합은 상시 작업이 됐다 |
| 3 | **배포** | 묶음은 `deploy/` 에 있다. GCP VM 을 만들고 올리는 일이 남았다(`deploy/README.md`) |

측정(analytics)은 통째로 미구현이다. `POST /api/events`도 이벤트 기록도 없다. 공개 후에 붙이면 초반 데이터를 잃으므로 2번과 3번 사이에 넣을지 정해야 한다.

**장애 지점 메모는 `design/23_FAILURE_POINTS.md`에 있다.** 2026-09-09에 코드 기준으로 훑은 것으로, 공개 전에 닫을 순서(웹훅 타임아웃·재시도 → 쓰기 멱등성·rate limit → 운영자 레버 → 헬스체크·백업 → 아침 요약 잡)가 적혀 있다.

**2026-09-09에 끝낸 것.** 딥링크 로그인 복귀(Intro의 Google 버튼이 `?redirect=`를 넘긴다)와 디자인·반응형 정리. 디자인 토큰은 `web/src/index.css` 머리에 있고, 색은 그 토큰만 쓴다. 900px 아래에서는 그래프 대신 안내와 연결·알림 진입점을 보여준다(docs/06 §5). 오버레이는 640px 아래에서 하단 시트가 된다. 본문 글꼴 Pretendard는 `web/index.html`에서 jsDelivr로 받는다. 데모 목의 받은 요청 상세가 비어 화면 전체가 죽던 것도 함께 고쳤다(`web/src/mocks/index.ts`).

**어두운 화면은 해 봤다가 뺐다.** 같은 날 옵시디언 그래프 뷰 방향으로 어두운 테마를 만들어 봤는데, 사용자가 눈이 아프다고 해서 지웠다. 다시 제안하지 않는다. 그때 붙인 것 중 테마와 무관한 둘은 남겼다 — 그래프의 hover 강조·툴팁(docs/07 §2.1·§2.3, 툴팁은 HTML이라 이름을 이스케이프한다)과, 캔버스가 색을 직접 갖지 않고 CSS 토큰에서 읽는 구조(`readGraphPalette()`). 캔버스 색을 바꿀 때도 `web/src/index.css`만 고친다.

**관심사 여러 개를 함께 볼 수 있다(D-76, 2026-09-09).** 앵커 관심사가 둘 이상이면 그것을 모두 가진 사람만 보인다(교집합). API는 `GET /api/graph?anchor=interest&interestIds=a,b`(최대 5개), 서버는 `userInterest.groupBy` + `having count = N`이다. 화면에서는 관심사 패널의 "함께 가진 사람만 보기", 노드 Shift+클릭, 상단 칩의 ×로 넣고 뺀다. 응답 `anchor`가 `{ type: "INTEREST", interests: [{id, name}] }`로 바뀌었다 — 데모 목의 캡처(옛 형태)는 `graphFor()`가 맞춰 준다.

### 다음 세션에서 이어서 할 것

**재개 지점(2026-09-11 밤). 대화록 둘 — `history/2026-09-11-network-threshold-lever-empty-interests-session.txt`(기준값 레버·D-93)와 `history/2026-09-11-onboarding-instant-network-session.txt`(D-94).**

> **끝낸 자리.** 작업 트리는 깨끗하다. **`dev` 가 `main` 보다 앞선다** — D-94 가 dev 에만 있다(운영 `ee035f1`, 개발 `d390f04`). 열린 일은 **D-94 승격 여부**와 아래 "다음에 할 것" 넷이다.
>
> **가입하자마자 네트워크를 하나 준다(D-94). `dev` 에만 있다.** `docs/10 §2a` 가 처음부터 적어 둔 것인데 코드에는 `// TODO(M5)` 만 있었다 — 09·18시 배치뿐이라 **아침에 가입한 사람은 저녁까지 빈 네트워크 화면**을 봤다. 이제 온보딩 완료 응답을 내기 전에 `recomputeAll()` → `expose({ onlyFor, limit: 1 })` 을 부른다(사용자 결정: **기다린다**. 온보딩은 사람당 한 번뿐이라 감당할 만하다). **노출 규칙은 하나도 안 바뀐다** — 슬롯 P-19 · 멤버 대부분 겹침 · 같은 멤버 집합 재추천 없음 · `network_enabled` 플래그가 그대로 걸린다. 달라진 건 부르는 시점뿐이다. 기존 멤버의 문구만 갈라진다: **"새 멤버가 가입해 네트워크가 생겼습니다. 이 N명은 관심사 M개를 모두 공유합니다"** — `payload.reason` 에서 렌더하므로 **`NotificationType` 추가도 마이그레이션도 없다.** 실패하면 로그만 남기고 **온보딩은 통과시킨다.** `if (user.status === 'ONBOARDING')` 이라 `complete()` 가 다시 불려도 한 번만 돈다.
>
> **같이 넣은 것 — `recomputeAll()` 을 한 번에 하나만 돌게 줄 세웠다.** 부르는 곳이 셋이 됐다(09·18시 배치 · 온보딩 · `/ops` 버튼). `network_candidate` 를 통째로 비우는 트랜잭션이 겹치면 교착이나 직렬화 오류로 끝난다 — 코호트로 여럿이 동시에 가입을 마치면 실제로 겹친다. **앞 호출에 묻어가지 않고 줄을 세운다**(묻어가면 방금 온보딩한 사람이 그 계산에 안 들어 있을 수 있다). 따로 떼어 확인했다 — 동시 5회 호출에서 최대 동시 실행 1, 끼어든 실행 없음, 중간 실패가 뒤를 막지 않음.
>
> **⚠️ D-94 는 실제 가입으로 확인하지 못했다.** 재현하려면 새 Google 계정이 필요하다. dev 에서 새 계정으로 가입해 셋을 본다 — ① 온보딩 직후 `/networks` 에 추천 1개 ② 기존 멤버에게 "새 멤버가 가입해…" DM ③ api 로그의 `온보딩 즉시 노출 — 후보 N개 중 1개 노출 (Nms)`. dev 는 더미 300명이 있어 후보가 잡힌다(안 잡히면 dev 의 P-04 도 4 로 내린다).
>
> **`main` 승격은 보류했다.** 온보딩은 **모든 신규 사용자가 지나는 단 하나의 길**이고, 운영은 `MATTERMOST_DELIVERY_MODE=live` 라 기존 멤버에게 **실제 DM** 이 나간다. dev 확인 뒤 `git push origin main` 한 줄이면 된다(로컬 `main` 이 이미 D-94 를 담고 있다).
>
> **운영에서 P-04 를 5 → 4 로 바꿨다(사용자가 직접, 2026-09-11 저녁). 그 자리에서 효과가 나왔다:**
>
> | | 전 | 후 |
> |---|---|---|
> | 후보 | 3 | **52** |
> | 열린 추천 | 2 | **27** |
> | 참여 | 0 | **7** |
> | 1인당 후보(게이트 1.00) | 0.16 | **2.91 · 통과** |
>
> **운영 실데이터는 더미와 결론이 다르다.** 미리보기가 운영에서 낸 숫자는 P-04=3 이어도 "인기 관심사뿐" 이 **0.7%** 다(더미는 26.9%). 이유는 인기 관심사의 정체다 — 실제 사람들이 가장 많이 고른 것은 **가볍게 이야기하기 · 대기업 · 관심사 친구 찾기**로, 주제가 아니라 *의도 태그*다. 그걸 고르면서 진짜 주제도 같이 골라 겹침이 분산됐다. `docs/10 §4` 가 2026-09-07 에 3 을 배제한 근거가 운영에서는 거의 나타나지 않는다. 더 낮추고 싶으면 미리보기를 다시 보고 정한다.
>
> **관심사가 없는 사람에게 이유를 말한다(D-93, 같은 날 저녁).** 관심사가 0개면 그래프에 자기 노드 하나만 남는데 그 화면이 고장과 구별되지 않았다. 네 곳(캔버스 겹침 · 왼쪽 레일 · 프로필 관심사 구역 · 좁은 화면)에 이유와 **`/profile?edit=interests`** 버튼을 뒀다 — 누르면 관심사 고르기가 바로 열리고, 닫으면 쿼리가 지워진다. 판정은 네 곳 모두 `me.interests.length === 0` 하나를 본다(그래프 응답의 `mine` 노드를 세면 남의 관심사를 중심에 놓고 볼 때 거짓말이 된다).
>
> **⚠️ D-93 의 빈 화면은 눈으로 확인하지 못했다.** 시험할 수 있는 dev 계정(`devjunsday`)에 관심사가 생겨 조건이 재현되지 않고, 앱으로는 그 상태를 만들 수 없다(`PUT /me/interests` 가 P-01 미만을 거부한다 — 내용 교체로만 생기는 상태다). **관심사 0개인 계정이 dev 에 하나 있다: `flal2884@gmail.com`(예앗).** 그 계정으로 그래프·프로필을 한 번 열어 보면 끝난다. 관심사가 있는 쪽 화면은 dev 에서 확인했다.
>
> **다음에 할 것 — 운영 지표를 훑어 찾은 결함 넷.** `/ops` 를 브라우저로 읽고 코드와 대조해 나온 것이다. 순서는 이대로 권한다.
>
> | | 무엇 | 어디 | 왜 |
> |---|---|---|---|
> | ③ | **관심사 0명 타일** | `OpsService.interests()` 에 `status:'ACTIVE'` + `interests:{none:{}}` 카운트 → 제품 탭 관심사 구역 | 오늘 운영에서 활성 56명 중 **약 13명**이 관심사 0개였는데(user_interest 584행 = 변경 +594−10, 바꾼 사람 43명으로 역산) 운영자가 그것을 볼 자리가 없다 |
> | ① | **진입점 계측** | `GraphPage.tsx` 의 `entryPoint` | `selection.kind` 를 봐서 **`GRAPH`·`POST`·`NETWORK_FAILED` 가 구조적으로 절대 안 나온다.** 운영 데이터가 그대로다 — SIMILAR 16 + PROFILE 27 = 43 = 보냄 43, 나머지 전부 0. 그런데 "열람 대비 요청" 패널은 그래프 734열람·관심사 상세 886열람과 짝지어 **0.0%** 를 찍고 "보기만 많고 요청이 없는 길은 구경거리다" 라고 적혀 있다 — **읽으면 잘 되는 화면을 자르게 된다.** 사람 노드 클릭 433 · 프로필 열람 519 가 대부분 그래프에서 나온 것이다. 고칠 방향: `selection.kind` 대신 `anchor.type` 을 봐서 `GRAPH`(내 그래프)·`INTEREST_DETAIL`(관심사 앵커)·`SIMILAR` 셋으로. **`PROFILE` 의 뜻이 바뀌므로 `docs/16` 에 결정을 남기고 `/ops` 표에 전환 시점을 적는다** |
> | ⑤ | **`APP_ENV` 표시** | `OpsService` 의 mode 블록 | 서버 탭이 `nodeEnv` 만 보여줘 **개발 서버에서도 "production" 으로 읽힌다.** 실제로 2026-09-11 에 "dev 에 prod 변수가 들어갔나" 하는 혼동이 있었다. dev VM 도 같은 프로덕션 이미지·같은 compose 를 쓰므로 `NODE_ENV=production` 이 맞고, 구분하는 값은 `APP_ENV=dev` 인데 화면에 없다 |
> | ② | **수락률 분모** | `ops.service.ts:376` 과 화면 라벨 | `accepted/(accepted+rejected+expired)` 라 **보냄 43 · 수락 34 인데 97.1%** 다. 진입점 표는 더 눈에 띈다 — "프로필 · 보냄 27 · 수락 22 · **수락률 100.0%**" 가 한 줄에 있다. **라벨을 고치는 쪽으로 정했다**(분모는 그대로. 대기 중인 요청을 넣으면 아직 답 안 한 것 때문에 지표가 출렁인다): 타일을 "결정된 요청의 수락률", 힌트를 "거절 N · 대기 N 제외", 표의 열을 "수락률(결정분)" |
>
> **그 밖에 확인만 하고 넘어간 것.** 앵커로 많이 쓴 관심사 상위 10개 중 7개가 "(삭제됨)" 이다 — 내용 교체 전 이벤트가 지워진 관심사를 가리킨다. 데이터가 틀린 건 아니고 패널이 그 기간만 못 쓴다. 그리고 **후속 확인 가드레일(docs/14 §4)은 0/0 인 것이 정상** — 성립이 09-10·09-11 이고 P-18=2일이라 **09-12 에 첫 질문이 나간다. 그날 숫자를 봐야 한다.** 배치 10종·5xx 0건·웹훅 81건 전부 성공·디스크 32.6GB 여유는 문제없다. 백업은 1개뿐이고(09-11 00:53) **복원 리허설은 아직 안 했다**(design/23, README §7).

**그 앞(2026-09-11 오후) — 네트워크 추천이 안 나오는 원인을 찾고 기준값 레버를 붙였다(D-91).**

> **원인은 P-04=5 가 179개 관심사 풀에서 사실상 도달 불가라는 것이다.** 규칙은 "3~6명 **전원의 교집합**이 5개 이상"인데, 관심사가 100개에서 179개로 늘면서 같은 기준이 훨씬 어려워졌다. 시드의 인기도 가중치를 그대로 써서 돌려 보면 120명·1인당 5~11개 선택에서 **3인 그룹 0개**다. 증거는 코드 안에도 있다 — `seed/dev-users.ts` 가 클러스터 4개를 인위적으로 심는다("이것이 없으면 게이트 판정을 시험해 볼 수 없다"). 지금까지 본 추천은 전부 심어 놓은 것이었다. 사람이 고르는 개수가 지배 변수다: 300명 기준 5~11개면 P-04=4 에서 15%, 8~15개면 79% 가 추천을 받는다.
>
> **그래서 `/ops` 제품 탭 Network 구역에 "후보 기준값" 을 붙였다.** P-04(전원 교집합)와 P-01(관심사 최소 선택)을 화면에서 바꾼다 — 그동안은 VM 에서 `psql` 이었다. 저장하면 캐시를 비우고 `network.recompute` 를 즉시 돌려 "후보 N · 노출 M" 을 돌려준다. **미리보기 버튼**이 핵심이다: 기준값 3·4·5·6 각각에 대해 후보 수, 추천 받는 사람 수, 1인당 슬롯, 그리고 **공통 관심사가 전부 인기 관심사(보유율 30%+)뿐인 후보의 비율**을 지금 데이터로 계산해 보여 준다(`GET /admin/ops/network/preview`, 저장하는 것 없음). 마지막 값이 기준을 낮출지 정하는 재료다 — 낮출수록 후보는 늘지만 "이 3명은 백엔드·알고리즘·취업 준비를 공유합니다" 가 된다. **3 도 저장된다(경고만)** — 2026-09-07 의 "3까지는 낮추지 않는다" 를 금지에서 경고로 바꿨다(D-91).
>
> **사용자가 정한 것(2026-09-11):** 범위는 P-04+P-01 둘, 3 은 허용하되 경고, 저장하면 즉시 재계산.
>
> **다음 첫 할 일 — 운영에서 미리보기를 눌러 숫자를 보고 기준값을 정한다.** 그 전에 사람들이 관심사를 다시 골라야 한다(아래 "운영에서 남은 손일 셋"). 관심사 선택이 0이면 미리보기도 전부 0이다. 제가 권한 출발점은 **P-01=8 · P-04=4** 다(시뮬레이션 기준 300명에서 76% 커버, 인기뿐 5%).
>
> **같이 손본 것.** `dropSubsets()` 를 첫 멤버로 버킷 지어 비교하도록 바꿨다 — 결과는 같고(무작위 4,000회 비교, 불일치 0) 비교 횟수만 준다. 기준을 3 으로 내리면 후보가 수만 개가 되어 여기가 먼저 느려지기 때문이다. `CandidateService` 는 `snapshot()`·`loadPairs()`·`buildAdjacency()`·`connectedPairs()` 로 쪼개져 재계산과 미리보기가 같은 파이프라인을 쓴다. SQL 은 가장 낮은 기준값으로 한 번만 친다.
>
> **아직 안 고친 것 셋(원인 C·D·E, 사용자에게 보고만 했다).**
> ① ~~`docs/10 §2a` 의 **온보딩 즉시 노출**~~ → **고쳤다**(D-94, `d390f04`. dev 에만). **관심사 변경 시 후보 갱신**은 그대로 남았다 — 관심사 저장에 훅이 없어 배치나 `/ops` 버튼을 기다린다. 일부러 미룬 것이다(저장할 때마다 전체 재계산이라 디바운스나 큐가 먼저 필요하다).
> ② `exposure.service.ts` 의 슬롯 계산이 멤버의 `decision` 을 안 봐서 **거절한 추천이 만료(3일)까지 슬롯을 먹는다.** `docs/10 §7` 은 "결정되면 노출" 이라고 적었고, 목록에서는 안 보이는 추천이라 사용자는 이유를 알 수 없다.
> ③ ~~`content-import.ts` 가 `networkCandidate` 를 안 지운다~~ → **고쳤다**(`1226474`). `--dry-run` 의 "지금 DB" 에도 후보 수를 찍는다.

**재개 지점(2026-09-11 낮·오후). 대화록 `history/2026-09-11-content-import-notifications-withdraw-session.txt`.** 하루에 다섯을 했다 — 관심사 수정 화면, **운영용 내용 한 벌 교체(운영 DB 에 실제로 넣었다)**, 시딩 구조 변경, **알림 선택과 운영자 공지**, **로그아웃·탈퇴**.

> **다음 첫 할 일 — 표시명을 하루 3회까지 바꿀 수 있게 한다(사용자 결정, 2026-09-11).** 지금은 하루 1회다(`api/src/modules/users/display-name-policy.ts` 의 `nextDisplayNameChangeAt`, docs/12 §3). **재료가 모자란다** — `user.nickname_changed_at` 한 칸뿐이라 "몇 번 바꿨는지" 를 셀 수 없다. 칸을 하나 더 두고(예: `nickname_changes_today` + 날짜, KST 기준으로 넘어가면 0) 마이그레이션을 붙이는 것이 곧은 길이다. 같이 고칠 것: `ProfilePage.tsx` 의 안내 문구와 `blockedReason`, docs/12 §3, docs/16 에 결정(D-92. D-91 은 기준값 레버가 가져갔다). **코드는 아직 안 건드렸다.**
>
> **운영 DB 교체는 끝났다.** 운영에서 `content:import` 를 돌려 **분류 13 · 관심사 199 · 주제별 질문 716 · 아이스브레이킹 30** 이 들어갔다(그 전에는 분류 11 · 관심사 120 · 질문 0). 예고대로 **선택 370건과 글 13건이 사라졌다.** 운영은 이 재개 지점의 코드 커밋 `9561b85` 로 떠 있다(번들 `index-CLQ6Qor9.js`, 2026-09-11 12:07 KST 확인. 이 문단이 든 문서 커밋만 한 칸 앞선다). 배포 확인은 `curl -s https://ssafy-networking.store/ | grep assets`.
>
> **운영에서 남은 손일 셋.** ① 운영 계정으로 https://ssafy-networking.store/profile 에서 **관심사 다시 고르기** ② `/ops` → 관리 → **공지 보내기**("관심사를 다시 골라 주세요") ③ 그 뒤 `/ops` → 제품 → Network → **지금 다시 계산**(안 눌러도 18:00 배치가 한다).
>
> **세션을 끝낸 자리(2026-09-11 12:10 KST).** 작업 트리는 깨끗하고 `origin/main` 까지 올라가 있다. 로컬 서버는 **켜 둔 채**다(API :3000, web :5173). 운영·개발 VM 에 손댈 일은 위 목록뿐이다.
>
> **개발 서버는 아직 옛 내용이다.** `origin/dev` 는 `44c0114` 에 멈춰 있다(main 보다 다섯 커밋 뒤). 더미를 새로 만들려면 dev 배포 → `content:import` → 운영 계정이 관심사를 고른 **다음** `seed:dev`(그래야 주변 클러스터 5명이 생긴다).

**운영용 내용은 파일 한 벌이 원본이다.** 사용자가 쓴 원본은 루트 `networking_questions.json`(분류·관심사·질문), 임포터와 시드가 먹는 것은 **`api/prisma/content.json`** 이다 — 층(속성 20개)·별칭 660개·포괄 질문 30개가 여기에만 있다. 분류 13 · 관심사 199(이야깃거리 179 + 층 20) · 주제별 질문 716. 합친 것 셋: 전시+미술관 → 전시·미술관, 사진+사진 촬영 → 사진, 카페+커피 → 카페·커피. 분류 순서는 층 → 개발 → 기술 스택 → CS → 프로젝트 → 커리어 → 학습 → 문화 → 음악 → 게임 → 스포츠 → 라이프 → 네트워킹 목적.

**시드가 그 파일을 읽는다.** 옛 하드코딩 목록(`seed/interests.ts`)은 지웠다. `seed/content.ts` 가 `content.json` 을 읽고, `seed/questions.ts` 에는 틀 문장 함수만 남았다(파일에 없는 관심사용). **시드는 upsert, 임포트는 통째 교체** — 빈 DB 에 `migrate deploy` + `prisma:seed` 만 돌려도 새 목록이 그대로 들어간다(검증함, 멱등). `seed/dev-users.ts` 의 인기 관심사·클러스터 이름도 새 이름으로 고쳤다 — 이름이 어긋나면 경고를 찍는다(옛 이름 여섯이 조용히 무시되어 Network 후보가 안 만들어지던 것을 고쳤다).

**관심사 수정은 대화상자에서 6단으로 본다.** `InterestPicker` 의 `variant: 'page' | 'overlay'`. overlay 는 화면을 거의 다 쓰는 `Dialog` 안에서 분류를 CSS 다단으로 흘린다(1400px 부터 6단, `--breakpoint-xwide`). **7·8단은 오히려 길어진다**(칩이 줄바꿈) — 6단이 바닥이다. 속성(층)이 목록 맨 위다. 1440×709 에서 199개가 600px, 보이는 칸이 543px 이라 마지막 두 줄쯤이 남는다. 더 줄이려면 칩의 "N명" 을 빼면 된다(533px, 실측). 그래프 색은 `--cat-13`·`--cat-14` 를 더해 14자리다(분류가 13개라 12자리로는 돌아 겹쳤다).

**알림을 사용자가 고르고, 운영자가 공지한다(D-89·D-90).** 프로필의 "알림" 구역에서 메신저 DM 을 **즉시/묶음 두 갈래**로 끈다(`GET·PATCH /api/me/notifications`). 앱 알림함은 못 끈다. `/ops` 관리 탭 맨 위 **"공지 보내기"** 는 온보딩을 마친 전원의 알림함에 남기고 DM 은 켠 사람에게만 보낸다(`POST /api/admin/ops/announce`, `GET .../announcements`). 알림 종류에 `ANNOUNCEMENT` 가 늘어 **마이그레이션이 하나 붙는다**(`20260911090000_announcement_notification`). 발송 경로에 **동시 5건 상한과 재시도**(1초·5초, `400`은 재시도 없음)가 들어가 design/23 §1 의 1순위가 닫혔다.

**로그아웃과 탈퇴가 생겼다(12 §10, 06 §3.11).** 프로필 맨 아래 "계정" 구역 — 로그인 이메일, 로그아웃, 탈퇴. 탈퇴는 `POST /api/me/withdraw`(온보딩 중에도 된다): 프로필·관심사·글·진행 중인 요청·주고받은 요청 메시지·후속 확인·알림·알림 설정을 지우고 `status=WITHDRAWN`, `googleSub`·`email`·실명·닉네임·메신저 아이디를 비운다. **성립된 연결과 네트워크는 남아 상대에게 "탈퇴한 사용자" 로 보인다(D-64).** `googleSub` 을 비우므로 같은 Google 계정으로 다시 가입할 수 있고 옛 데이터는 돌아오지 않는다. 열려 있던 네트워크 추천에서 빠지고 남은 인원이 3 미만이면 그 추천은 DISSOLVED. **마지막 운영자는 탈퇴할 수 없다.** 더미 계정으로 실제로 돌려 확인했다(요청 CANCELLED·메시지 비움·holderCount 감소·세션 401).

**Network 추천을 버튼으로 지금 돌린다.** `/ops` 제품 탭 Network 구역에 켜져 있을 때만 보이는 **"지금 다시 계산"** — `POST /api/admin/jobs/run` 으로 `network.recompute` 를 불러 후보 계산·노출·알림을 그 자리에서 끝내고 "후보 N · 노출 M" 을 돌려준다. 18:00 배치를 기다리지 않아도 된다. 로컬에서 눌러 확인했다(redirect 모드라 운영자 채널로 `NETWORK_RECOMMENDED` 두 건이 갔다).

**표시명 저장 버튼이 말없이 잠겨 있던 것을 고쳤다.** 사용자 피드백("닉네임 변경시 저장 버튼 활성화가 안돼"). 원인은 둘이었다 — (1) 버튼이 입력 중 검사(`GET /onboarding/nickname-check`)의 `ok === true` 를 요구하는데 검사가 실패하면 조용히 `null` 로 돌아가 버튼이 영영 안 켜졌다 (2) 진짜 이유인 **하루 1회 제한**이 회색 한 줄(`Muted`)이라 눈에 안 띄었다. 이제 `DisplayNameForm` 의 검사는 `idle·checking·ok·bad·unknown` 다섯 상태이고 **버튼은 검사에 걸지 않는다**(최종 판정은 서버가 한다 — `packages/shared/src/errors.ts` 에 한국어 문구가 이미 있다). 어떤 상태든 버튼 아래 이유가 한 줄 뜨고, 하루 1회는 `Notice` 상자로 올라왔다.

**알림이 나가는 시각(KST).** 09:00 묶음(보낼 것이 있는 사람만) · 09:00·18:00 네트워크 재계산 · 09:05 게이트 판정(발송 없음) · 매시 만료/리마인드/후속 확인 · 10분마다 요청 만료. 나머지는 즉시.


**재개 지점(2026-09-11 새벽). 대화록 `history/2026-09-10-feedback-10-deploy-fix-interest-admin-session.txt`.**

> **내일 첫 할 일 — 사용자가 운영용 내용(분류·관심사·질문) 파일을 준다.** 받으면 `prisma/content.example.json` 형태의 JSON 으로 옮겨 `npm run content:import -- <파일> --dry-run` 으로 먼저 보여 주고, 로컬 → 개발 → 운영 순으로 넣는다. **DB 를 완전히 초기화하고 다시 넣는 것으로 합의했다**(사용자 결정) — 기존 관심사·선택·글·네트워크 추천은 사라지고 계정·연결·알림은 남는다. JSON 이 번거로우면 표나 글로 받아 내가 옮긴다.
>
> **물어봤던 커밋 둘은 올라갔다(2026-09-11).** `2bb97f2`·`d426fc9` 를 포함해 `origin/main` 과 `origin/dev` 가 같은 커밋으로 맞춰져 있다.

**2026-09-11 — 프로필의 관심사 수정을 한 화면에 담았다.** 사용자 피드백("관심사가 스크롤이 아니라 한 번에 다 볼 수 있게"). 본문 폭 안의 상자(`max-h-72vh`, 안에서 스크롤)를 없애고 **화면을 거의 다 쓰는 대화상자**로 연다(`h-94dvh` × `min(1440px,96vw)`, `ProfilePage.tsx`. `ResponsiveDialog` 는 520px 이라 `Dialog` 를 직접 쓴다). `InterestPicker` 의 `embedded` 는 **`variant: 'page' | 'overlay'`** 가 됐다 — overlay 는 분류 덩어리를 CSS 다단(`sm` 2 → `md` 3 → `lg` 4 → `xl` 5, `break-inside-avoid`)으로 흘리고 칩을 12px 로 줄이고, **분류 바로가기 버튼과 상단 "선택한 것" 줄을 뺐다**(목록이 다 보이고 고른 것은 제자리에서 파랗게 보이므로 중복이다. 그 높이를 목록에 준다). 1440×709 뷰포트에서 관심사 100개 + 층 20개가 **스크롤 0** 으로 들어간다(로컬 실측). 좁아지면 단이 줄고 그때는 스크롤한다. 온보딩(`page`)은 그대로다.

네 가지를 했다.

3. **그래프 노드를 전부 원으로 되돌리고 분류 색을 12가지로 늘렸다(`2bb97f2`).** 사각형·별을 시험해 봤지만(별은 스크린샷까지 보고 사용자가 물렀다) 작은 노드에서 뭉개지고 별은 아래 두 꼭짓점이 이름표를 찔렀다. `encoding.ts` 의 `shapeOf`/`traceShape` 는 `traceNode` 하나로 줄었다. **회색은 사람만 쓴다** — 옛 `--cat-8`(#495057)이 사람 색과 같아 관심사가 사람처럼 보였다. 분류가 11개라 8자리로는 색이 돌아 겹치기도 했다. 새 팔레트는 `index.css` 의 `--cat-1`~`--cat-12`, 전부 유채색이고 빨강(나)도 피했다. 같은 커밋에서 **관심사 수정을 대화상자로** 옮겼다(줄 안 칸이 좁다는 피드백. 이름 큰 칸 + 분류 목록 + 별칭 여러 줄, 한 줄에 하나).
4. **내용을 파일 하나로 갈아 끼우는 도구(`d426fc9`).** `npm run content:import -- <파일.json> [--dry-run]`(`api/prisma/content-import.ts`). zod 로 형태·이름 중복을 먼저 잡고, `--dry-run` 이 "넣을 것 / 지금 있는 것 / 사라지는 선택(누가 고르고 있는데 파일에 없는 관심사)"을 보여 준다. 실행은 한 트랜잭션 — `category`·`interest`(선택·글·이력·주제별 질문이 cascade)·`icebreaker_question`·`network_recommendation` 을 비우고 파일대로 채운다. **계정·연결 요청·알림·파라미터는 남는다.** 로컬에서 실제로 비우고 채우는 것까지 확인한 뒤 시드로 되돌려 놨다. 형태 예시는 `api/prisma/content.example.json`.

1. **자동 배포에서 api·web 이 어긋나던 것을 고쳤다.** 개발 서버가 "새 api + 옛 web" 으로 떠 있었다 — `auto-deploy.sh` 가 api 이미지의 지문만 보는데 Actions 가 api 를 먼저, web 을 13초 뒤에 올려, 그 틈에 낀 cron 이 옛 web 을 받아 띄우고는 api 지문이 같아져 다시 돌지 않았다. 이제 **빌드는 sha 태그만 붙이고 두 이미지가 다 올라간 뒤 마지막 "이동 태그" 단계에서 latest·dev 를 한꺼번에 붙인다**(build.yml). `auto-deploy.sh` 도 api·web 지문을 둘 다 본다. **배포 확인은 `/api/parameters` 만 보지 말고 `curl -s https://<도메인>/ | grep assets` 로 번들 이름도 본다.** 커밋 `f6653e9`. 운영·개발 둘 다 이 커밋으로 떠 있고 D-83~D-87 도 함께 올라갔다.
2. **관심사 자체를 운영 화면에서 관리한다(D-88).** `/api/admin/interests` GET/POST/PATCH/:id/DELETE/:id (`interests-admin.service.ts`·`interests-admin.controller.ts`), `/ops` 관리 탭의 "관심사 목록" 구역. 이름·별칭·분류·순서·숨김. **지우기는 고른 사람이 0명일 때만**이고 사람이 있으면 숨김을 권한다. 종류(이야깃거리↔속성)가 달라지는 분류 이동도 0명일 때만. 마이그레이션은 없다(status·aliases·sortOrder 가 이미 있었다).

**아직 안 한 것:** 운영·개발 VM 의 질문 데이터 — 내용 파일을 넣을 것이므로 이제 `prisma:seed` 대신 `content:import` 로 한 번에 해결된다. 관심사 **합치기(병합)** 와 **사용자 정지** 레버는 여전히 없다. 로컬 서버(3000·5173)는 켜 둔 채로 끝났다.

**재개 지점(2026-09-10 밤, 사용자 피드백 10건 → D-83~D-87).** 사용자가 기능 피드백 10건을 줬고 전부 구현해 로컬에서 화면·API 로 확인한 뒤 `dev` 에 올렸다(운영 `main` 에는 아직 안 갔다). **다음에 할 일: 개발 서버 `dev.ssafy-networking.store` 에서 한 번 보고 `git merge --ff-only dev` 로 main.** 새 마이그레이션 `20260910230000_profile_message_reject_visible_questions` 은 컨테이너 시작 때 `migrate deploy` 로 붙고, **시드를 다시 돌려야 질문이 생긴다** — 개발·운영 VM 에서 `docker compose -f deploy/docker-compose.prod.yml exec api npm run prisma:seed`(포괄 질문 30개, 관심사마다 틀 질문 3개. 이미 있는 것은 덮지 않는다). 한 일:
(1) 비슷한 사람 패널 스크롤 — 그래프 그리드의 행 높이가 `auto` 라 패널이 화면 밖으로 자랐다. `gridTemplateRows: minmax(0,1fr)`(`GraphPage.tsx`).
(2) 글 삭제 전 확인 대화상자(`MyPosts.tsx`).
(3) 반 바꾸기 — 이미 프로필의 "실명 수정"(D-81) 에 반 드롭다운이 있다. 새로 만든 것 없음.
(4) **거절이 바로 보인다(D-83).** `RelationStatus`·`SentRequestStatus` 에 `REJECTED`. 보낸 요청 목록에 "거절됨" + "표시 지우기"(`POST /connection-requests/:id/dismiss` → `requester_dismissed_at`), 사람 패널에 "다시 요청". **P-07(14일 대기)·P-08a 는 삭제.** 다시 요청하면 옛 거절 행은 자동으로 지워진다. 거절 DM 은 없다. `RelationService` 는 이제 파라미터를 안 읽는다.
(5) **프로필 메시지(D-85).** `user.profile_message`, `PATCH /me/profile-message`, `PublicUser.profileMessage`(presenter 가 넣는다). 사람 패널·받은 요청 상세·내 프로필에 보인다.
(6) **초대 링크 기본 비활성(D-84).** 플래그 `invite_required`(기본 false). `AuthService.resolveUser` 가 플래그를 본다. 소개 화면은 `features.invite_required` 로 버튼을 정한다. `/ops` 관리 탭 "가입" 구역에서 켜고 끈다(`PUT /admin/ops/invite`). `ParametersService` 의 플래그 기본값은 이제 `FEATURE_FLAGS` 에서 나온다.
(7) 그래프 노드 모양 — 사람 원, 관심사 모서리 둥근 사각형, 나는 테두리 두 겹 + "나" 글자(`encoding.ts` `shapeOf`/`traceShape`, 범례도 같은 모양).
(8) **관심사 분류 CRUD(D-86).** `/api/admin/categories`(`interests/categories.service.ts`), `/ops` 관리 탭. 비어 있을 때만 삭제, kind 는 못 바꾼다.
(9)(10) **네트워킹 질문(D-87).** 모델 `InterestQuestion`·`IcebreakerQuestion`, `NetworkRecommendation.icebreakerIds`(성립 때 2개 뽑아 고정). `api/src/modules/questions/`, `/api/admin/questions/...`, `NetworkDetail.questions`(성립 후 참여자만), 성립 알림 DM 에 "이야깃거리" 몇 줄. 성립 화면의 묶음마다 2개 보이고 "더 보기". 시드 `api/prisma/seed/icebreakers.ts`. 1:1 연결에는 아직 안 붙였다.
남은 것: 사용자 정지·관심사 병합·숨김 레버는 여전히 없다. `.vercel/` 폴더와 옛 워크트리는 그대로다.

**그 앞 재개 지점(2026-09-10 저녁). 대화록 `history/2026-09-10-registry-autodeploy-ops-dev-server-limits-session.txt`.** 이 파일 하나에 이날 낮부터 밤까지가 다 있다 — Artifact Registry 파이프라인 → 첫 배포 → `/ops`(D-77) → 자동 배포 cron → 개발 서버(`dev` 브랜치) → 운영 레버(D-78·D-79) → 대화창 링크 제거(D-80) → 패널 폭·배지·실명 수정(D-81) → 요청·글 상한 해제(D-82). **운영과 개발 서버 둘 다 커밋 `9704265` 로 떠 있고**, 개발 VM 에도 이날 저녁 crontab 이 들어가 자동 배포가 된다. 열린 일은 없고 로컬 서버는 내려 둔 상태다. 다음에 볼 만한 것: 사용자가 원하면 거절 뒤 14일 재요청 대기(P-07)와 관심사 직접 추가 하루 3개(D-74)도 풀 수 있다 — 아직 그대로다. 공개 전 남은 일은 위 표와 design/23 의 순서(알림 발송 동시성·재시도 → 정지·병합 레버 → UptimeRobot → 백업 cron·복원 리허설 → OAuth 동의 화면 "프로덕션" 확인)다.

**2026-09-10 밤(3) — 요청·글 횟수 상한 해제(D-82).** 사용자 피드백으로 연결 요청의 일 5·주 20 과 수락률 감속, 글의 관심사당 하루 1·전체 하루 3 을 없앴다. `QuotaService` 와 `GET /me/request-quota`, 오류 코드 `REQUEST_LIMIT_REACHED`·`POST_LIMIT_REACHED`, 파라미터 P-06d·P-06w·P-22 가 사라졌다(DB 의 옛 `app_parameter` 행은 무시된다). 남는 것: 메시지 필수, 거절 후 재요청 대기(P-07), 같은 메시지 안내(D-61), 운영자 정지(`requestSuspended`), 관심사 직접 추가 일 3(D-74). `/ops` 의 "상한 도달" 은 **오늘 최다 발송**(한 사람의 최대 건수, 10건부터 붉게)으로, "감속 발동" 은 **수락률 낮은 사용자**(P-20·P-21 은 신호 기준으로만 남는다)로 바뀌었다.

**2026-09-10 밤(2) — 패널 폭 조정, 알림 배지 규칙(D-81), 실명 수정.** 셋 다 로컬에서 만들어 확인받고 올린다. (1) 그래프 화면 양쪽 패널의 폭을 경계선 손잡이로 끌어 바꾼다(`web/src/features/graph/usePanelWidths.ts`·`PanelResizeHandle.tsx`). localStorage `sn.graph.panelWidths` 에 남고 두 번 누르면 기본 폭. 캔버스는 ResizeObserver 로 따라온다. (2) **배지 = 아직 확인하지 않은 알림 수(D-81, D-31 대체).** `GET /notifications/badge` 가 `readAt` 없는 것을 세고, 알림함을 열면 `POST /notifications/read-all` 로 전부 읽음이 되어 배지가 사라진다. 목록의 "처리가 필요한 것" 구역은 그대로다. (3) My Profile 에 **실명 수정**(`PATCH /api/me/real-name`, `UsersService.setRealName`, `web/src/features/profile/RealNameForm.tsx`). 이름·반만 바꾸고 하루 1회 규칙은 걸지 않는다. `SelfUser.identity` 가 재료(이름·반·캠퍼스)다. 금칙어 목록은 `nickname.service.ts` 의 `BANNED_WORDS` 를 같이 쓴다. 뒤이어 헤더를 손봤다: 첫 메뉴는 "커넥션", "내 프로필" 메뉴는 빠지고 오른쪽 위 표시명이 프로필 링크다(`Shell.tsx`). 그래프 홈의 "내 그래프" 칩은 없앴고, 프로필의 "내가 쓴 글"은 실명과 관심사 사이다. 프로필의 관심사 구역은 다른 구역과 같은 결(현재 관심사 칩 + "관심사 수정" 버튼)이고, 누르면 `InterestPicker` 가 `embedded` 로 상자 안에 열린다 — 검색은 상자 위에 고정, 목록은 상자 안에서 스크롤, 저장·취소는 상자 발. 온보딩은 `embedded` 없이 그대로다.

**2026-09-10 밤 — 대화창 링크 제거(D-80)와 프로필 표시명 변경.** 연결 성립 화면의 "Mattermost에서 대화 열기" 버튼은 SSAFY Mattermost 가 대화창으로 이어 주지 않아 없앴다. `@아이디` 복사만 남는다. `ConnectionAction.mattermostLink` 와 `MATTERMOST_URL` 은 사라졌다(보안 비밀에 남아 있어도 읽지 않는다). My Profile 에 **표시명 바꾸기**(`PATCH /api/me/display-name`, `UsersService.setDisplayName`)가 생겼고 온보딩 2단계도 같은 서비스와 같은 폼(`web/src/features/profile/DisplayNameForm.tsx`)을 쓴다. **하루 1회 규칙(docs/12 §3)이 여기서부터 실제로 걸린다** — 온보딩의 첫 선택은 세지 않고(`display-name-policy.ts`), 같은 값 저장은 변경이 아니다. `SelfUser.displayNameChangeableAt` 로 화면이 미리 잠근다. 시험할 때 하루에 두 번 바꾸면 막히는 것이 정상이다.

**2026-09-10 저녁 — 운영 레버 둘(D-78·D-79).** `/ops` 제품 탭의 Network 구역에 **켜고 지금 노출** 스위치(`PUT /api/admin/ops/network`: `ParametersService.setFlag` → `JobsService.runNow('network.recompute')` → 처음이면 전원에게 `NETWORK_ENABLED`, dedupeKey 로 1회). `/ops` 에 **관리 탭**이 생겨 운영자를 이메일로 추가·해제한다(`/api/admin/ops/operators`). 기능 플래그는 이제 `SessionProvider` 가 들고 있어(`features`·`reloadFeatures`) 스위치를 켜면 새로고침 없이 Network 탭이 나타난다. 개발 서버에서 처음 확인할 때: 관리 탭 → 제품 탭 Network → 켜기.

**2026-09-10 저녁 — 개발 서버(`dev` 브랜치 → `dev.ssafy-networking.store`).** 운영과 같은 VM 을 하나 더 두고 더미 사용자를 채워 배포 전에 본다. `dev` 에 푸시하면 Actions 가 태그 `dev` 로 올리고 개발 VM 의 cron 이 받는다. **VM 은 체크아웃한 브랜치를 따라간다** — `deploy.sh`·`auto-deploy.sh`·`fetch-env.sh` 가 브랜치를 보고 이동 태그와 보안 비밀 이름을 고른다(main → `latest`·`ssafy-net-env`, dev → `dev`·`ssafy-net-env-dev`). `deploy.sh` 는 이제 `git pull` 대신 `origin/<브랜치>` 에 `reset --hard` 한다. `seed:dev` 는 운영 컨테이너(`NODE_ENV=production` 이면서 `APP_ENV=dev` 가 아님)에서는 멈춘다. 화면 위 "개발 서버" 띠는 호스트 이름 `dev.` 로 판단한다(`web/src/components/DevServerBanner.tsx`). 디자이너용 Vercel 데모 배포는 없앴다(`vercel.json` 삭제. Vercel 대시보드의 프로젝트는 사용자가 지운다). **사용자가 아직 할 것(README §11):** VM `ssafy-net-dev` → 고정 IP → DNS `dev` A 레코드 → OAuth 리디렉션 URI → 보안 비밀 `ssafy-net-env-dev`(교육장 컴퓨터에 만들어 둔 `deploy/.env.dev` 를 올린다. git 에 없다) → Cloud Shell 접근자 한 줄 → 개발 VM 에서 `-b dev` clone → fetch-env → deploy → `prisma:seed` → 가입 → 운영자 플래그 → `seed:dev` → crontab. 흐름은 dev 에 푸시 → 확인 → `git merge --ff-only dev` 로 main. **발송 모드는 운영·개발 둘 다 `live` 로 하기로 했다(사용자 결정, 같은 날).** 개발 서버는 `redirect` 를 자물쇠로 두자고 권했으나 시험하는 사람에게 실제 DM 이 가야 해서 바꿨다. 교육장 컴퓨터의 `deploy/.env`·`deploy/.env.dev` 사본도 `live` 로 맞춰 두었다.

**2026-09-10 오후 — 자동 배포.** VM 의 cron 이 2분마다 `deploy/auto-deploy.sh` 를 돌려 레지스트리 `api:latest` 지문이 바뀌었으면 `deploy.sh` 를 부른다. **main 에 푸시하면 몇 분 안에 서비스가 된다.** 밖에서 들어오는 SSH 키는 없고 VM 서비스 계정만 쓴다. 끝나면 운영자 채널에 "[deploy] 배포됨 — 커밋 …" 한 줄(웹훅 기본 채널). 롤백 `IMAGE_TAG=<sha> ./deploy/deploy.sh` 는 `deploy/.pin` 을 만들어 자동 배포를 멈추고, 태그 없이 돌리거나 `rm deploy/.pin` 하면 재개된다. 이미지 라벨 `org.opencontainers.image.revision` 에 커밋이 있다. 설치는 README §8 의 crontab 한 줄 — **사용자가 VM 에서 아직 안 했으면 그것부터.**

**2026-09-10 오후 — 운영자 대시보드 `/ops` 와 이벤트 기록(D-77).** 사용자가 원한 것: 어떤 관심사를 누가 추가했는가, 어느 시간에 방문이 빈번한가, 사람들이 보고 싶어하는 관계가 추천인가 직접 탐색인가 — PM 시각과 서버 개발자 시각을 나눠 한 화면에서 본다. 구조: `GET /api/admin/ops?days=N`(`api/src/modules/ops/`, 운영자만) → `OpsMetrics`(`packages/shared/src/ops.ts`) → web `/ops`(`web/src/pages/OpsPage.tsx`, lazy chunk, 헤더 오른쪽 "운영" 링크는 운영자에게만). 열람은 서버가 `analytics_event` 에 남기고(`AnalyticsService.track`, graph/users/interests/notifications 컨트롤러), 화면 안의 클릭만 프론트가 `POST /api/events` 로 보낸다(`web/src/analytics.ts`, GraphPage 계측). 5xx·느린 요청·웹훅 실패는 메모리 카운터(`api/src/common/stats.service.ts`). `AuthGuard` 가 `lastSeenAt` 을 1시간에 한 번 갱신. compose 가 `deploy/backups` 를 api 에 읽기 전용 마운트(마지막 백업·디스크 여유). 로컬에서 실제 데이터로 화면까지 확인했다. **별자리 UI 는 보류를 권했고 사용자 결정은 아직이다.** 어두운 배경이 전제라 09-09 결정과 충돌한다. 하게 되면 밝은 배경의 옛 성도(종이 별지도) 방식 한 가지만, 공개 전 남은 일 뒤에 shadcn 때처럼 데모 빌드로 보고 정한다. 라벨·배지·선택 상태는 그대로 두고 장식만 바꾼다(docs/07 은 도구다).

**2026-09-10 10:20 KST — 첫 배포 성공.** `https://ssafy-networking.store/api/health` 가 `{"ok":true}`, TLS 정상, HTTP→HTTPS 308, SPA 폴백과 `/api`·`/n` 프록시 동작. 이미지 태그 `353afd6`(=latest). 오는 길에 막힌 것 넷과 처방은 `deploy/README.md` 트러블슈팅에 있다(VM SSH 에서 IAM 명령, private 저장소 clone, 보안 비밀 접근자 역할 누락, 보안 비밀 내용이 `api/.env` 였던 것 — 교육장 컴퓨터의 `api/.env` 로 `deploy/.env` 를 다시 만들어 새 버전으로 올렸다. `POSTGRES_PASSWORD`·`SESSION_SECRET` 은 이때 새로 생성). **시드와 본인 가입·로그인 시험까지 통과했다(10:40 KST).** 남은 운영 준비: 운영자 플래그(SQL) → OAuth 동의 화면 "프로덕션" 확인(테스트 상태면 본인 외 로그인이 막힌다) → UptimeRobot → 백업 cron·복원 리허설(README §7, 운영 DB 대신 `ssafynet_restore` 에 풀어 본다). 그 다음이 모니터링 이야기.

**2026-09-10 오전 — 이미지 파이프라인을 Artifact Registry 로 바꿨다.** VM 에서 빌드하지 않는다. `git push` → GitHub Actions(`.github/workflows/build.yml`)가 api·web 이미지를 빌드해 `asia-northeast3-docker.pkg.dev/ssanecting/ssafy-net/{api,web}:<짧은 sha>`·`latest` 로 올린다 → VM 에서 `./deploy/deploy.sh`(로그인 → pull → up → healthy 대기). 롤백은 `IMAGE_TAG=<sha> ./deploy/deploy.sh`. compose 의 `build:` 는 빠졌고 비상용 `deploy/docker-compose.build.yml` 을 겹치면 VM 빌드가 된다. 이유와 대안 비교는 design/20 §13. **사용자가 아직 해야 할 것(README §5-2):** Cloud Shell 에 명령 붙여 넣기(Artifact Registry API·저장소 `ssafy-net`·서비스 계정 `gh-actions`·키·VM 서비스 계정 reader) → 키를 `gh secret set GCP_SA_KEY < 파일` 로 GitHub 에 → Actions 초록불 확인 → VM 에서 `deploy.sh`. 그 전까지 Actions 는 첫 단계 "secret 확인" 에서 빨간불이 나는 것이 정상이다. **이날 아침 VM 은 22·80·443 이 전부 닫혀 있었다** — 꺼져 있을 가능성이 크다. 콘솔에서 상태부터 본다. 교육장 컴퓨터에는 gcloud 도 Docker 데몬도 없어 VM 은 콘솔로만 본다.

**2026-09-10 새벽 진행** (대화록 `history/2026-09-10-shadcn-gcp-deploy-session.txt`. 그 앞 세션은 실수로 닫혀 `history/2026-09-09-gcp-decision-deploy-bundle-session.txt` 에 본문만 복원해 두었다). 두 갈래를 동시에 했다.

- **배포는 VM 에 SSH 로 들어가기 직전까지 왔다.** (아래 절차 중 `compose up -d --build` 는 이제 `./deploy/deploy.sh` 다.) 실제 값은 `deploy/README.md` 머리의 표에 있다. 끝난 것: GCP 프로젝트 `ssanecting`, VM `ssafy-net`(서울 e2-medium, Ubuntu 24.04, 40GB, HTTP/HTTPS), 고정 IP `35.216.40.235`, 도메인 **`ssafy-networking.store`** 구매와 A 레코드(01:30 KST 부터 풀린다), Google OAuth 리디렉션 URI 추가, **Secret Manager** 에 `ssafy-net-env` 보안 비밀(로컬 `deploy/.env` 내용 그대로)과 VM 서비스 계정 권한, VM 액세스 범위를 "모든 Cloud API" 로 변경. **VM 에 Docker 까지 설치했다**(02:00 KST). 세션 끝에 clone → `./deploy/fetch-env.sh` → `compose up -d --build` 를 백그라운드로 걸어 두라고 했다(로그 `~/build.log`). **다음 세션은 VM SSH 에서 상태부터 본다**: `cd ~/ssafy-net && docker compose -f deploy/docker-compose.prod.yml ps` 와 `curl -s https://ssafy-networking.store/api/health`. `~/ssafy-net` 이 없으면 걸어 두지 못한 것이니 README §5 의 clone 부터. 그 뒤 순서는 시드(초대 코드 출력) → 초대 링크로 본인 가입·로그인 시험(redirect 모드라 Mattermost 코드는 운영자 채널로 온다) → 운영자 플래그 → UptimeRobot → 백업 cron·복원 시험. OAuth 동의 화면이 "프로덕션" 인지는 아직 확인하지 않았다 — 로그인 시험 때 같이 본다.
- **GCP 콘솔 작업은 사용자가 직접 한다.** 브라우저를 대신 조작하다가 세션이 닫혀 어디까지 했는지 잃은 적이 있어, 한 단계씩 알려 주고 확인받는 방식으로 바꿨다.
- **환경 변수의 원본은 Secret Manager 다.** VM 의 `deploy/.env` 는 `fetch-env.sh` 로 내려받은 사본이다. 값을 바꿀 때는 콘솔에서 새 버전을 올리고 스크립트를 다시 돌린다(README §5-1).
- **프론트 UI 를 shadcn/ui 로 전면 교체해 main 에 넣었다**(사용자가 데모로 보고 승인). 스택은 Tailwind v4(`@tailwindcss/vite`) + shadcn 컴포넌트 20개(`web/src/components/ui/`, `cn()` 은 `web/src/lib/utils.ts`). 공용 조각은 `components/primitives.tsx`, 오버레이는 `components/ResponsiveDialog.tsx`(640px 위 Dialog, 아래 Sheet). 옛 CSS 파일 셋(`shell.css`·`panels.css`·`demo-banner.css`)은 삭제했고 `index.css` 에는 Tailwind 진입점·shadcn 변수(primary 는 기존 파랑)·그래프 토큰만 남았다. `readGraphPalette()` 가 읽는 변수명은 그대로다. 밝은 테마만 있고 `.dark` 블록·토글은 없다. 토스트는 sonner, 관심사 검색은 cmdk. VM 은 배포 시점의 main 을 받으므로 첫 배포에 이미 새 UI 가 들어간다. 옛 워크트리 `.claude/worktrees/agent-a37627bf50a32b6a8`(브랜치 `feat/shadcn-ui`, 설치까지만 한 중복본)는 지워도 된다: `git worktree remove --force .claude/worktrees/agent-a37627bf50a32b6a8 && git branch -D feat/shadcn-ui`.

**배포부터 한다. 그 다음 모니터링 포인트를 이야기한다**(2026-09-09에 정한 순서. 위 표의 1·2번보다 앞선다).

배포는 design/20 §13(단일 VM + Docker Compose + Caddy)을 따른다. design/23의 "공개 전에 닫을 것" 가운데 헬스체크와 웹훅 타임아웃은 배포에 같이 넣는 편이 낫다 — 없으면 배포 뒤에 서버가 죽어도 알 길이 없다.

**서버는 Google Cloud VM 한 대다**(2026-09-10 확정, 서울 e2-medium, 신규 계정 $300 · 90일 크레딧으로 비용 0). Oracle Cloud 무료 티어를 먼저 시도했으나 가입이 막혀 접었다 — 오라클 가입 화면의 홈 영역 목록은 그 순간 무료 여유가 있는 리전만 보여 주고 국내 리전은 자주 빠진다.

**배포 묶음은 만들어져 있다(`deploy/`, 2026-09-10).** 루트 `Dockerfile` 이 `api`·`web` 두 이미지를 만들고, `deploy/docker-compose.prod.yml` 이 db + api + web(Caddy, TLS 자동)을 띄운다. 같이 넣은 것: `GET /api/health`(DB SELECT 1), 종료 훅, 웹훅 5초 타임아웃과 오류 구분(400만 아이디 오류, 나머지는 `MATTERMOST_UNAVAILABLE` 503), 운영 로그의 쿼리스트링 제거, `connection_limit=20`, `backup.sh`. **GCP 에서 할 일은 `deploy/README.md` 에 순서대로 있다** — 계정·VM·도메인·OAuth 리디렉션·첫 배포·UptimeRobot·백업·공개일 스위치·2주 뒤 정리. 로컬에서는 `SITE_ADDRESS=:80` 으로 TLS 없이 띄워 볼 수 있다(쿠키가 secure 라 로그인은 안 된다).

Google OAuth 클라이언트가 있는 Google 계정과 VM 을 띄우는 GCP 계정은 **달라도 된다.** 서로 모른다. 리디렉션 URI 추가와 동의 화면 "프로덕션" 게시만 OAuth 쪽 계정에서 한다.

모니터링 이야기의 재료는 둘이다.

- **무엇을 모니터링할 것인가.** `docs/14 §4`가 North Star를 **신규 성립 연결 수**, 가드레일을 **후속 확인 "대화 시작" 응답 ≥ 50%**로 이미 정해 두었다. 미결정으로 남은 것은 "운영자가 매일 볼 대시보드의 형태"다(14 미결정 표). 제품 지표와 별개로 서버 지표(가동 여부, 배치가 돌았는지, 알림 발송 실패율)를 무엇으로 볼지도 정해야 한다. 웹훅이 이미 있으니 매일 아침 운영자 채널로 배치 요약을 보내는 방법이 있다.
- **사용자에게 전달하려는 핵심 가치.** 이것이 정해져야 위 지표가 대리 지표인지 진짜 지표인지 판단할 수 있다. `docs/01 P3`("먼저 연락할 명분이 없다")와 `docs/14 §4`의 North Star 논거가 재료다.

## 다른 컴퓨터에서 이어서 시작하기

```bash
git clone https://github.com/DevJunz/ssafy-net.git && cd ssafy-net
npm install
npm run build --workspace=@ssafy-net/shared   # api·web이 참조한다. 먼저 빌드
cp api/.env.example api/.env                  # 값 채우기 (아래)
npm run db:up && npm run prisma:migrate && npm run prisma:seed
npm run seed:dev                              # 더미 120명 + 내 주변 클러스터
npm run dev:api                               # :3000
npm run dev:web                               # :5173
```

`api/.env`에 채워야 하는 값 (`.env`는 git에 없다):

| 키 | 어디서 |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | [Google Cloud Console](https://console.cloud.google.com/auth/clients). 리디렉션 URI `http://localhost:3000/api/auth/google/callback` |
| `MATTERMOST_WEBHOOK_URL` | Mattermost ⋮ → 통합 → 들어오는 웹후크. **"이 채널로 잠금" 반드시 해제** |
| `MATTERMOST_OPERATOR_USERNAME` | 웹훅을 만든 계정. 이 계정만 DM을 못 받아 인증을 우회한다 |
| `SESSION_SECRET` | 아무 문자열 |

## 읽을 것

1. `README.md` — 실행 방법
2. `design/README.md` → `design/20 §14`(구현 순서) → `design/22 §16`(화면 ↔ API 매핑)
3. `docs/19_PLANNING_HANDOFF_SUMMARY.md` — 제품 규칙 진입점
4. `docs/16_PRODUCT_DECISION_LOG.md` — **D-60~D-74가 구현 중 내린 결정**이다. 특히 D-66~D-68(Mattermost)과 D-72~D-74(층·직접 추가)가 기획을 뒤집었다
5. 필요할 때 원문 `docs/01`~`18`

제품 규칙이 충돌하면 `docs/`가, 기술 판단이 충돌하면 `design/`이 우선한다.

## 사용자(제품 오너)가 정한 규칙

- 기획 문서(`docs/`)에는 코드·ERD·API·기술 스택을 넣지 않는다. 구현 중 생긴 **제품 결정만** `docs/16`에 덧붙인다(docs/19 §10의 절차).
- 표시명은 닉네임/실명 선택제. 연결 성립 시 실명 공개. 소속 정보는 표시하지 않는다.
- 차단 없음. 연결 해제 없음. 자체 메신저·DM·댓글·좋아요 없음. **신고도 만들지 않는다(D-69)**.
- **알림은 Mattermost + 앱 내 알림함 둘뿐(D-67).** 이메일·브라우저 알림·외부 채널은 만들지 않는다.
- **온보딩 첫 단계가 Mattermost 계정 인증(D-66).** 이것이 SSAFY 소속 검증을 겸한다.
- **메신저에서 사람을 찾는 수단은 실명이 아니라 @아이디(D-68).** 실명은 표시용.
- 로그인은 Google만. **가입에 초대 링크는 필요 없다(D-84)** — Mattermost 인증이 소속 검증이다. 초대 링크 요구는 플래그 `invite_required`(기본 꺼짐)로 `/ops` 에서 켤 수 있다. 운영자 = 사용자 본인. 시드 = 같은 반 26명.
- 관심사는 100개 확정본 + 사용자 직접 추가(추가 전 중복·유사 검사, D-74). 층(1~20)은 속성 분류로 하나만 고르고 공통 계산에서 뺀다(D-72). 반은 1~22 드롭다운(D-73). **목록의 주인은 운영자다(D-88)** — `/ops` 관리 탭에서 관심사를 만들고 이름·별칭·분류·순서를 고치고 숨기고 지운다. 지우기는 고른 사람이 0명일 때만이고, 사람이 있으면 숨김이다. 합치기는 아직 없다.
- 사용은 공개 후 약 2주에 집중. 시간 파라미터는 하루 단위.
- 연결/Network 성립 시 시작자를 지정해 구체적으로 안내한다.
- 그래프 간격·노드 크기·표시 상한은 문서로 확정하지 않는다. 써 보고 조정한다(D-34).
- **연결 요청과 글에 횟수 상한을 두지 않는다(D-82, 2026-09-10 사용자 피드백).** 남는 안전장치는 메시지 필수와 운영자 정지다. **거절은 보낸 사람에게 바로 "거절됨"으로 보이고, 곧바로 다시 요청할 수 있다(D-83).** 거절 뒤 대기(P-07)는 없다. 같은 날 취소한 요청만 내일까지 기다린다.
- **네트워크가 성립하면 대화 재료를 준다(D-87).** 관심사별 고정 질문 + 포괄 아이스브레이킹 2개. 운영자가 `/ops` 관리 탭에서 채운다. 관심사와 그 분류도 거기서 만들고 고치고 지운다(D-86·D-88). 프로필 메시지 한 줄은 본인이 쓴다(D-85).

## 반드시 지킬 것 두 가지

**1. 실명이 새지 않게.** 사용자 표현은 `PublicUser` / `ConnectedUser` / `SelfUser` 셋뿐이고, `realName` 키가 응답에 들어갈 수 있는 곳은 (1) 연결됨 상태의 상대 (2) 성립된 Network 참여 멤버 (3) 나 자신뿐이다. 새 엔드포인트를 만들 때 `UserPresenter`를 거치지 않으면 안 된다. (design/20 §11)

**2. Mattermost 발송 모드.** `MATTERMOST_DELIVERY_MODE`의 기본값은 `redirect`이며, 이것이 안전장치다. 이 상태에서는 **모든 DM이 운영자 채널로만 가고 다른 사람에게는 아무것도 가지 않는다.** 배치가 잘못 돌면 수십 명에게 한 번에 나가고 되돌릴 수 없다. 공개할 때만 `live`로 바꾼다.

## 자주 쓰는 것

```bash
# 배치를 즉시 돌린다 (3일 만료를 기다리지 않고 확인)
curl -X POST localhost:3000/api/admin/jobs/run -H 'Content-Type: application/json' \
  -d '{"name":"request.expire"}'      # request.expiry-remind, connection.follow-up,
                                       # connection.initiator-remind, network.recompute,
                                       # network.expire, digest.send, gate.evaluate ...
curl localhost:3000/api/admin/jobs     # 실행 이력

# Network 게이트 판정 (docs/10 §4)
curl localhost:3000/api/admin/networks/gate

# holder_count 재계산 (비정규화 값이 어긋났을 때)
docker exec -i ssafy-net-db psql -U ssafynet -d ssafynet < api/scripts/recount-interest-holders.sql

# 공개 규모(약 1,000명)로 부하를 재현한다. 기본값은 120명
SEED_USERS=1000 npm run seed:dev
```

운영자 엔드포인트는 `is_operator = true`인 계정만 쓸 수 있다. 로컬 계정에는 이미 켜 두었다. 첫 운영자는 SQL 로 켜고, 그 다음부터는 `/ops` 관리 탭에서 이메일로 추가·해제한다(D-79. 자기 자신은 해제 불가).

> **Network 추천은 `network_enabled`가 켜져야 노출된다**(D-75). 꺼져 있으면 후보만 계산하고 알림은 나가지 않는다. 켜는 것은 운영자가 `/ops` 제품 탭의 Network 구역에서 한다(D-78). 켜면 후보 재계산·노출이 즉시 돌고, 처음이면 온보딩을 마친 전원에게 "네트워크 추천이 시작되었습니다" 가 간다. 게이트 판정(docs/10 §4)은 화면에 참고값으로 보인다. 새 DB 는 꺼진 채 시작한다.

## 알아둘 함정

- **Prisma `migrate dev`는 비대화형에서 막힌다.** 유니크 제약 경고에 확인을 요구한다. 마이그레이션 SQL을 직접 쓰고 `prisma migrate deploy`로 적용한다.
- **`prisma generate`는 API가 떠 있으면 실패한다**(엔진 DLL을 잡고 있음). 서버를 먼저 멈춘다.
- **`shared`를 고치면 `npm run build --workspace=@ssafy-net/shared`를 먼저** 돌려야 한다. CJS/ESM 듀얼 빌드라 api는 CJS, web은 ESM을 쓴다. dist 경로가 바뀌면 Vite 캐시를 지우고 `--force`로 재시작한다.
- **shared를 빌드했으면 api를 재시작한다.** `nest start --watch`는 `api/src`만 본다. dist가 바뀌어도 다시 읽지 않아 **옛 검증 규칙이 그대로 돌아간다**. `api/src` 파일을 touch해도 안 먹는다 — 프로세스를 죽이고 다시 띄운다.
- **Vite 프록시 키는 정규식으로**. `'/n'`처럼 쓰면 접두사 매칭이라 `/node_modules/*`까지 API로 넘어가 앱이 통째로 죽는다.
- **가입은 초대 링크를 먼저 열어야 한다.** 바로 로그인하면 Google 인증은 성공하고 `/invite-required`로 튕긴다. 신규 사용자는 `sn_invite` 쿠키(10분)가 있어야 만들어진다. 초대 코드는 `prisma:seed`가 출력한다.
- **정규식을 셸을 거쳐 파일에 쓰지 않는다.** heredoc과 템플릿 문자열을 겹치면 `\d`의 백슬래시가 사라져 `/^d{1,2}반$/` 같은 것이 만들어진다. 타입 검사도 통과하고 조용히 전부 거부한다. 편집 도구로 직접 쓴다.
- **`psql -tAc`는 `RETURNING` 값 뒤에 명령 태그까지 출력한다.** `INSERT ... RETURNING id`의 결과에 `INSERT 0 1`이 붙어 온다. id는 따로 `SELECT`로 읽는다.
- **파라미터·기능 플래그는 30초 캐시된다.** DB에서 값을 바꿔도 서버에 바로 반영되지 않는다(`ParametersService`).
- **Docker 빌드에서 `prisma generate`는 openssl이 있어야 한다.** 없으면 엔진을 `debian-openssl-1.1.x`로 잘못 골라 컨테이너가 "Query Engine을 찾을 수 없다"며 재시작을 반복한다. `schema.prisma`의 `binaryTargets`에 `debian-openssl-3.0.x`를 명시해 두었고 Dockerfile의 deps 단계에도 openssl을 넣었다. 베이스 이미지를 바꾸면 둘 다 다시 본다.
- **main 에 푸시하면 곧 운영 배포, dev 에 푸시하면 곧 개발 서버다.** Actions 초록불 뒤 2분 안에 그 브랜치의 VM 이 받아 띄운다(`deploy/auto-deploy.sh`). 시험은 `dev` 에 올려 개발 서버에서 본다(deploy/README §11). 잠깐 멈추려면 그 VM 에서 `touch deploy/.pin`. VM 은 체크아웃한 브랜치로 자기 역할을 아니 VM 에서 브랜치를 바꾸지 않는다. **배포됐는지는 `/api/parameters` 만 보고 판단하지 않는다** — api 와 web 은 따로 올라간다. 화면 쪽은 `curl -s https://<도메인>/ | grep assets` 로 번들 이름이 바뀌었는지 본다.
- **운영 compose는 저장소 루트에서 `-f deploy/docker-compose.prod.yml`로 실행한다.** `deploy/.env`를 compose 파일 옆에서 찾는다. `--project-directory`를 바꾸면 못 찾는다. **`up -d --build`는 이제 안 된다** — `build:`가 없다. 평소에는 `./deploy/deploy.sh`, 비상시에만 `-f deploy/docker-compose.build.yml`을 겹친다. `IMAGE_TAG`는 셸 환경으로 넘기고 `.env`(Secret Manager)에 넣지 않는다.
- **저장소가 private 이라 VM 의 clone 은 배포 키(읽기 전용 Deploy key)로 한다.** HTTPS 주소에 계정 비밀번호를 넣으면 `Password authentication is not supported` 로 막힌다. README §5. Cloud Shell(`@cloudshell` 프롬프트)과 VM SSH(`@ssafy-net` 프롬프트)를 헷갈리기 쉽다 — IAM 은 Cloud Shell, 배포는 VM.
- **VM 안의 gcloud 는 VM 서비스 계정이다.** 저장소 생성·비밀 읽기는 되지만 권한 부여(`add-iam-policy-binding`)는 `setIamPolicy` 거부로 실패한다. IAM 작업은 콘솔의 Cloud Shell(본인 계정)에서 한다. 2026-09-10 에 README §5-2 명령을 VM SSH 에 붙여 넣어 한 번 겪었다.
- **커밋을 당겨온 뒤 `npm install`을 먼저.** 다른 컴퓨터에서 의존성이 추가된 커밋(예: Swagger)을 받으면 API가 "모듈을 찾을 수 없다"로 컴파일에 실패한다.

## Phase 0 프로토타입 (참고용, 빌드 대상 아님)

```
cd phase0-mvp && npm install && npm run dev
```

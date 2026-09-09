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
| 3 | **배포** | design/20 §13. 단일 VM + Docker Compose + Caddy |

측정(analytics)은 통째로 미구현이다. `POST /api/events`도 이벤트 기록도 없다. 공개 후에 붙이면 초반 데이터를 잃으므로 2번과 3번 사이에 넣을지 정해야 한다.

**장애 지점 메모는 `design/23_FAILURE_POINTS.md`에 있다.** 2026-09-09에 코드 기준으로 훑은 것으로, 공개 전에 닫을 순서(웹훅 타임아웃·재시도 → 쓰기 멱등성·rate limit → 운영자 레버 → 헬스체크·백업 → 아침 요약 잡)가 적혀 있다.

**2026-09-09에 끝낸 것.** 딥링크 로그인 복귀(Intro의 Google 버튼이 `?redirect=`를 넘긴다)와 디자인·반응형 정리. 디자인 토큰은 `web/src/index.css` 머리에 있고, 색은 그 토큰만 쓴다. 900px 아래에서는 그래프 대신 안내와 연결·알림 진입점을 보여준다(docs/06 §5). 오버레이는 640px 아래에서 하단 시트가 된다. 본문 글꼴 Pretendard는 `web/index.html`에서 jsDelivr로 받는다. 데모 목의 받은 요청 상세가 비어 화면 전체가 죽던 것도 함께 고쳤다(`web/src/mocks/index.ts`).

**어두운 화면은 해 봤다가 뺐다.** 같은 날 옵시디언 그래프 뷰 방향으로 어두운 테마를 만들어 봤는데, 사용자가 눈이 아프다고 해서 지웠다. 다시 제안하지 않는다. 그때 붙인 것 중 테마와 무관한 둘은 남겼다 — 그래프의 hover 강조·툴팁(docs/07 §2.1·§2.3, 툴팁은 HTML이라 이름을 이스케이프한다)과, 캔버스가 색을 직접 갖지 않고 CSS 토큰에서 읽는 구조(`readGraphPalette()`). 캔버스 색을 바꿀 때도 `web/src/index.css`만 고친다.

**관심사 여러 개를 함께 볼 수 있다(D-76, 2026-09-09).** 앵커 관심사가 둘 이상이면 그것을 모두 가진 사람만 보인다(교집합). API는 `GET /api/graph?anchor=interest&interestIds=a,b`(최대 5개), 서버는 `userInterest.groupBy` + `having count = N`이다. 화면에서는 관심사 패널의 "함께 가진 사람만 보기", 노드 Shift+클릭, 상단 칩의 ×로 넣고 뺀다. 응답 `anchor`가 `{ type: "INTEREST", interests: [{id, name}] }`로 바뀌었다 — 데모 목의 캡처(옛 형태)는 `graphFor()`가 맞춰 준다.

### 다음 세션에서 이어서 이야기할 것

서버 구성을 정하기 전에 두 가지를 먼저 합의한다.

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
| `MATTERMOST_URL` | `https://meeting.ssafy.com` |
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
- 로그인은 Google만. 가입은 초대 링크. 운영자 = 사용자 본인. 시드 = 같은 반 26명.
- 관심사는 100개 확정본 + 사용자 직접 추가(추가 전 중복·유사 검사, D-74). 층(1~20)은 속성 분류로 하나만 고르고 공통 계산에서 뺀다(D-72). 반은 1~22 드롭다운(D-73).
- 사용은 공개 후 약 2주에 집중. 시간 파라미터는 하루 단위.
- 연결/Network 성립 시 시작자를 지정해 구체적으로 안내한다.
- 그래프 간격·노드 크기·표시 상한은 문서로 확정하지 않는다. 써 보고 조정한다(D-34).

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

운영자 엔드포인트는 `is_operator = true`인 계정만 쓸 수 있다. 로컬 계정에는 이미 켜 두었다.

> **Network 추천은 `network_enabled`가 켜져야 노출된다**(D-75). 꺼져 있으면 후보만 계산하고 알림은 나가지 않는다. 켜는 것은 게이트 판정 뒤 운영자의 결정이다(docs/10 §4).

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

## Phase 0 프로토타입 (참고용, 빌드 대상 아님)

```
cd phase0-mvp && npm install && npm run dev
```

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

**남은 것**: 디자인 · 배포. (관심사 100개는 D-71로 확정, 층 선택·직접 추가는 D-72~D-74)

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
```

운영자 엔드포인트는 `is_operator = true`인 계정만 쓸 수 있다.

## 알아둘 함정

- **Prisma `migrate dev`는 비대화형에서 막힌다.** 유니크 제약 경고에 확인을 요구한다. 마이그레이션 SQL을 직접 쓰고 `prisma migrate deploy`로 적용한다.
- **`prisma generate`는 API가 떠 있으면 실패한다**(엔진 DLL을 잡고 있음). 서버를 먼저 멈춘다.
- **`shared`를 고치면 `npm run build --workspace=@ssafy-net/shared`를 먼저** 돌려야 한다. CJS/ESM 듀얼 빌드라 api는 CJS, web은 ESM을 쓴다. dist 경로가 바뀌면 Vite 캐시를 지우고 `--force`로 재시작한다.
- **shared를 빌드했으면 api를 재시작한다.** `nest start --watch`는 `api/src`만 본다. dist가 바뀌어도 다시 읽지 않아 **옛 검증 규칙이 그대로 돌아간다**. `api/src` 파일을 touch해도 안 먹는다 — 프로세스를 죽이고 다시 띄운다.
- **Vite 프록시 키는 정규식으로**. `'/n'`처럼 쓰면 접두사 매칭이라 `/node_modules/*`까지 API로 넘어가 앱이 통째로 죽는다.

## Phase 0 프로토타입 (참고용, 빌드 대상 아님)

```
cd phase0-mvp && npm install && npm run dev
```

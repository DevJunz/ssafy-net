# SSAFY Connection (ssafy-net)

관심사 그래프로 아직 모르는 사람을 발견하고, 서로 대화할 의사를 확인한 뒤, 실제 대화는 사내 메신저에서 실명으로 시작하는 네트워킹 서비스. 단일 캠퍼스 약 1,000명 대상.

**Discover → Understand → Connect.** 대화는 서비스 밖에서 일어난다.

## 문서

| 폴더 | 내용 |
|---|---|
| [`docs/`](docs/README.md) | 기획 01~19. **무엇을 만들지.** 이 단계에서 수정하지 않는다 |
| [`design/`](design/README.md) | 설계 20~22 (Architecture · ERD · API). **어떻게 만들지** |
| `phase0-mvp/` | Phase 0 프로토타입. 방향 검증용, 보존만 한다 |
| `history/` | 기획 세션 기록 |

제품 규칙이 충돌하면 `docs/`가, 기술 판단이 충돌하면 `design/`이 우선한다.

## 구성

```
api/               NestJS + Prisma + PostgreSQL
web/               React + Vite
packages/shared/   API 타입 · 파라미터 키 · Zod 스키마 · 오류 문구
```

## 개발 환경 준비

```bash
npm install
npm run build --workspace=@ssafy-net/shared   # api·web이 참조한다. 먼저 빌드
cp api/.env.example api/.env                  # 값 채우기 (아래 참조)

npm run db:up                                 # postgres 16 (Docker)
npm run prisma:migrate                        # 스키마 적용
npm run prisma:seed                           # 관심사 100개 + 층 20개 · 파라미터 · 초대 코드
```

시드가 초대 코드를 출력한다. 가입 링크는 `http://localhost:5173/invite/<코드>`다.

### Google OAuth 설정 (로그인에 필요)

로그인은 Google만 지원한다(D-56). [Google Cloud Console](https://console.cloud.google.com/auth/clients)에서 OAuth 클라이언트 ID(웹)를 만들고 아래를 `api/.env`에 넣는다.

- 승인된 리디렉션 URI: `http://localhost:3000/api/auth/google/callback`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

### Mattermost 설정 (인증과 알림에 필요)

온보딩 첫 단계가 Mattermost 계정 인증이고(D-66), 알림도 전부 이리로 간다(D-67).

1. Mattermost에 **나만 있는 비공개 채널**을 하나 만든다 (예: `interest-network-log`)
   목적지를 지정하지 않은 메시지가 여기로 떨어진다. **폭발 반경**이므로 공개 채널을 쓰지 않는다.
2. **⋮ → 통합 → 들어오는 웹후크 → 추가**. 위 채널을 지정하고 **"이 채널로 잠금"은 반드시 해제**한다.
   잠그면 `@아이디`로 DM을 보낼 수 없다.
3. `api/.env`에 넣는다.

```
MATTERMOST_URL="https://meeting.ssafy.com"
MATTERMOST_WEBHOOK_URL="https://.../hooks/xxxxxxxx"
MATTERMOST_OPERATOR_USERNAME="내_아이디"   # 웹훅 생성자는 자기 자신에게 DM을 받을 수 없다
MATTERMOST_DELIVERY_MODE="redirect"        # 공개할 때만 live
```

확인: `npm run mm:check --workspace=api`

> ⚠️ **`MATTERMOST_DELIVERY_MODE`의 기본값 `redirect`가 안전장치다.**
> 이 상태에서는 모든 DM이 운영자 채널로만 가고 다른 사람에게는 아무것도 가지 않는다.
> 배치가 잘못 돌면 수십 명에게 한 번에 나가고 되돌릴 수 없다.

## 실행

```bash
npm run dev:api    # http://localhost:3000/api
npm run dev:web    # http://localhost:5173
```

`web`이 `/api`와 `/n`을 `api`로 프록시한다. 세션 쿠키를 같은 오리진에서 주고받기 위해서다.

## 자주 쓰는 명령

```bash
npm run seed:dev                                          # 개발용 더미 120명 + 내 주변 클러스터
npm run prisma:studio                                     # 데이터 확인
npm run build                                             # shared → api → web
docker exec -i ssafy-net-db psql -U ssafynet -d ssafynet \
  < api/scripts/recount-interest-holders.sql              # holder_count 재계산
```

## 구현된 것

- 초대 링크 → Google 로그인 → **Mattermost 계정 인증** → 표시명 → 관심사 (온보딩 3단계)
- 나 중심 그래프 + 사이드 패널 4종, 관심사 레일, Similar People
- 연결 요청·수락·거절·만료·취소, 연결 성립 화면(@아이디 + 대화창 링크), 후속 확인
- Mattermost 알림 + 앱 내 알림함 + 딥링크, 배치 10종
- Network 추천(후보 생성·노출·참여·성립), Interest Post, 묶음 알림
- 관심사 100개 확정본(`api/prisma/seed/interests.ts`) + 사용자 직접 추가(추가 전 중복·유사 검사), 활동하는 층 선택, 반 1~22 선택

## 진행 상황

| 마일스톤 | 범위 | 상태 |
|---|---|---|
| M1 기반 | 저장소 구성, 스키마, 시드, 인증·초대, 온보딩 | **완료** |
| M2 발견 | 그래프, Interest/Person 패널, Similar People | **완료** |
| M3 연결 | 요청·수락·거절·만료, Connections, 성립 화면, 후속 확인 | **완료** |
| M4 알림 | 알림함·배지·Mattermost 발송·배치 10종 | **완료** |
| M5 Should | Network 추천, Interest Post, 묶음 알림, 관심사 직접 추가 | **완료** (신고는 만들지 않음 D-69, 제안은 직접 추가로 대체 D-74) |

M3까지가 MVP의 최소선이다(design/20 §14).

## 공개 전 남은 것

| 항목 | 담당 |
|---|---|
| 디자인 | 화면이 다 나온 상태 |
| 배포 | design/20 §13 단일 VM + Docker Compose 기본안 |

B-3(이메일)·B-4(외부 채널)는 Mattermost 도입(D-66~D-68)으로 더 이상 확인할 필요가 없다.

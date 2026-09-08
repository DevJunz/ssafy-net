# Interest Network (ssafy-net)

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
npm run prisma:seed                           # 관심사 100개 · 파라미터 · 초대 코드
```

시드가 초대 코드를 출력한다. 가입 링크는 `http://localhost:5173/invite/<코드>`다.

### Google OAuth 설정 (로그인에 필요)

로그인은 Google만 지원한다(D-56). [Google Cloud Console](https://console.cloud.google.com/apis/credentials)에서 OAuth 클라이언트 ID(웹)를 만들고 아래를 `api/.env`에 넣는다.

- 승인된 리디렉션 URI: `http://localhost:3000/api/auth/google/callback`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

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

## 진행 상황

| 마일스톤 | 범위 | 상태 |
|---|---|---|
| M1 기반 | 저장소 구성, 스키마, 시드, 인증·초대, 온보딩 | **완료** |
| M2 발견 | 그래프, Interest/Person 패널, Similar People | **완료** |
| M3 연결 | 요청·수락·거절·만료, Connections, 성립 화면, 후속 확인 | **완료** |
| M4 알림 | 알림함·배지·이메일·브라우저 알림·배치 | 다음 |
| M5 Should | Network 추천 **완료**. Interest Post, 신고, 관심사 제안 남음 | 진행 중 |

M3까지가 MVP의 최소선이다(design/20 §14).

## 구현 시작 전 남은 것

| ID | 항목 | 담당 |
|---|---|---|
| B-1 | 초기 관심사 100개 확정 | 사용자. 현재는 임시 목록(`api/prisma/seed/interests.ts`) |
| B-3 | 이메일 발송 가능 여부 | M4에서 테스트 |
| B-4 | Discord 등 외부 채널 발송 가능 여부 | M4에서 테스트 |

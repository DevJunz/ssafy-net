# 23. 장애 지점과 운영 준비 (2026-09-09 메모)

공개 전에 닫아야 할 것을 코드 기준으로 훑은 기록이다. 결론은 세 줄이다.

- **서버 성능은 이 규모에서 장애 원인이 아니다.** 실측 처리량(초당 306건)이 현실 최대 부하(초당 15건)의 20배다(20 §13).
- **장애가 날 곳은 세 군데다.** Mattermost 웹훅 경로(타임아웃·재시도 없음, 동시성 무제한), 쓰기 요청의 동시 중복(수락 더블클릭이 500), 운영 준비(백업·헬스체크·종료 훅 없음).
- **공개 전 순서.** 웹훅 타임아웃·오류 구분·재시도 잡 → 쓰기 멱등성과 userId 기준 rate limit → 운영자 레버 → 헬스체크·종료 훅·백업 → 매일 아침 요약 잡.

---

## 1. 그래프 호출은 병목이 아니다

홈 진입마다 요청 3개(`/graph`, `/recommendations/similar-people`, `/interests`), 앵커 변경·모드 전환·노드 선택마다 1개. 폴링 없음. 서버는 `user_interest` 약 7,000행을 한 번 집계하고 사람 30명·관심사 20개를 읽는다.

캐시는 넣지 않는다. 관심사를 바꾸면 즉시 반영돼야 하고(NFR-5), 필요도 없다.

손댈 곳은 하나다. **`DATABASE_URL`에 `connection_limit=20`을 명시한다.** Prisma 기본 풀은 코어×2+1이라 2 vCPU에서 5개뿐이고, 동시 200에서 p95 852ms가 나온 원인이다.

## 2. 1,000명 · 2주 데이터량

가정: 평균 관심사 7개, 활성률 40%, 성사율 30%, 요청 상한 일 5·주 20.

| 표 | 행 수 | 비고 |
|---|---|---|
| user_interest | 7,000 | |
| user_interest_change | 10,000 | |
| mattermost_verification | 1,500 | 재발송 포함 |
| connection_request | 1,600 | 이론 최대 40,000 |
| connection / follow_up_check | 500 / 1,000 | |
| notification | 20,000 | 묶음 알림 하루 최대 1,000 × 14일이 대부분 |
| notification_delivery | 40,000 | 알림당 채널 2개 |
| network_candidate | 2,190 | 재계산마다 갈아엎음 |
| analytics_event (미구현) | 130,000 | DAU 300 × 이벤트 30 × 14일. 가장 큰 표가 된다 |

합쳐서 100~200MB. 126명에 15MB였다. 행 수는 걱정거리가 아니고, **백업이 없고 2주 뒤 전체 삭제 절차(docs/12 §10)가 없는 것**이 문제다.

## 3. 서버 구조 — 단일 인스턴스

design/20 §13 기본안 그대로. VM 하나에 Docker Compose로 `api` + `postgres` + Caddy, `web`은 정적 번들을 Caddy가 서빙.

코드가 이 구조를 전제한다.

- **같은 출처를 가정한다.** 프론트는 `/api` 상대 경로, 쿠키 `sameSite: lax`, CORS origin 하나. 알림 딥링크 `/n/:id`도 API에 있다. Vercel(web) + EC2(api)로 나누면 쿠키가 크로스사이트가 된다.
- **Supabase는 얻는 것이 자동 백업 하나다.** pgbouncer 뒤에서 `$transaction`을 쓰려면 플래그가 더 필요하다.
- **인스턴스는 하나여야 한다.** 배치가 인프로세스 cron이다(20 §7).

어디에: ~~AWS 서울 EC2 t4g.small 이상 또는 Lightsail 4GB(월 고정 $24, 스냅샷 원클릭). Oracle 무료 ARM은 확보가 복불복이고 유휴 회수가 있다. 이미 확보한 것이 있을 때만.~~

**→ Google Cloud 서울 e2-medium 으로 확정(2026-09-10).** Oracle 은 가입 화면의 홈 영역 목록에서 국내 리전이 빠져 있어(무료 여유가 없는 리전은 그 순간 숨긴다) 접었다. GCP 는 신규 계정 $300 · 90일 크레딧이 기간 전체를 덮는다. 구성은 `deploy/`(20 §13).

## 4. 로드밸런싱은 필요 없다

동시 500에서 나온 연결 거부는 Node accept 대기열(511)이 넘친 것이고 Caddy가 앞에 서면 사라진다. LB가 아니라 리버스 프록시의 일이다.

늘려야 하면 HTTP는 무상태(JWT 쿠키)라 복제된다. 걸림돌은 cron뿐이다. `RUN_JOBS=true`인 프로세스 하나만 `JobsModule`을 올리면 api×N + worker×1이 된다. 20줄. 지금은 안 한다.

대신 해야 할 가용성 작업:

| 항목 | 현재 | 할 것 |
|---|---|---|
| 헬스체크 엔드포인트 | **있음(2026-09-10)** `GET /api/health` — DB `SELECT 1`, 실패 503 | compose healthcheck 가 30초마다 부른다 |
| 종료 훅 | **있음(2026-09-10)** `app.enableShutdownHooks()` | |
| 외부 모니터 | 없음 | UptimeRobot 무료(5분 간격) → `/api/health`. `deploy/README.md` §6 |
| 컨테이너 재시작 | **전부(2026-09-10)** `deploy/docker-compose.prod.yml` | |

## 5. 반복 요청 · 남용

**있는 것(도메인 상한, 전부 DB count 기반).** 연결 요청 일 5·주 20 + 수락률 감속, 관심사 생성 일 3, 글 관심사당 일 1·전체 일 3, 인증 코드 시간당 사용자 5·대상 3.

**없는 것.**

- **전역 rate limit.** 읽기 엔드포인트가 무제한이다. 초대 코드 조회(`GET /invites/:code`)도 무제한. `@nestjs/throttler`로 분당 120 정도.
- **반드시 userId 기준.** 캠퍼스 1,000명이 같은 공인 IP 뒤에 있다. IP 기준이면 전원을 막는다.
- **상한 검사와 insert의 원자성.** 같은 요청을 동시에 20번 쏘면 일 상한을 넘긴다. 수락은 두 번째 트랜잭션이 unique 위반으로 500. 처방: 수락은 `updateMany where status='PENDING'` 후 count 확인, 요청은 `(requester_id, target_id) WHERE status='PENDING'` 부분 유니크 인덱스, 프론트 버튼 연타 방지.
- **정지 엔드포인트.** `requestSuspended` 필드와 검사는 있는데 켜는 곳이 없다(운영자 레버).

## 6. Mattermost 웹훅

**발송 확인은 이미 받고 있다.** 들어오는 웹훅은 서버가 게시물을 만든 뒤 200을 준다. 200 = 상대 DM 채널에 메시지가 생성됨. 없는 아이디는 400. 알 수 없는 것은 "봤는가"뿐이다(단방향).

`api/src/infra/mattermost/mattermost.service.ts`와 `modules/onboarding/mattermost-verification.service.ts`의 문제:

| 문제 | 처방 |
|---|---|
| ~~`fetch`에 타임아웃이 없다. 느려지면 요청이 매달린다~~ | **닫음(2026-09-10)** `AbortSignal.timeout(5000)` |
| ~~5xx·네트워크·타임아웃도 "아이디를 다시 확인"으로 나간다~~ | **닫음(2026-09-10)** 400만 아이디 오류(`VALIDATION_FAILED`). 나머지는 `MATTERMOST_UNAVAILABLE` 503 "메신저 서버가 응답하지 않습니다". 재시도 잡은 아직 |
| 웹훅 성공 뒤에 verification 행을 만든다. insert 실패 시 코드는 갔는데 검증 불가 | 행을 먼저 만들고(SENDING) 발송 뒤 갱신. 프론트 상태 표시·재발송 잡의 기반 |
| 웹훅이 죽으면 온보딩 전체가 선다. 알림 채널이 그 웹훅이라 감지 수단이 없다 | 서버 로그 + 외부 모니터. 우회로로 **운영자 수동 인증 엔드포인트**(운영자가 직접 DM으로 코드를 주고 verified 처리) |
| SSAFY Mattermost의 rate limit 설정을 모른다 | redirect 모드에서 기본 채널로 50건/5초 쏴서 429가 나오는지 잰다 |

**알림 발송(`notifications.service.ts`)도 같은 병.** `void deliver()`로 동시성 무제한, 실패는 `attempts`만 올리고 끝, 프로세스가 죽으면 QUEUED로 영원히. 처방: 인프로세스 큐(동시 4) + 5xx·네트워크에만 지수 백오프 3회 + 10분마다 FAILED·오래된 QUEUED 재발송 잡. 스키마(`status`·`attempts`·`error`, `[channel, status]` 인덱스)는 이미 있다.

## 7. 지표

docs/14 결정: North Star = 신규 성립 연결 수, 가드레일 = "대화 시작" 응답 ≥ 50%, 판단 1·3·7·14·28일, 페이지뷰·세션 길이·가입자 수 제외.

| 지표 | 지금 뽑히나 | 비고 |
|---|---|---|
| 요청→수락, 수락→대화 시작 | O | `connection_request.status`, `follow_up_check` |
| Network 노출→참여→성립 | O | `network_member.decision` |
| 추천 대비 성사율의 **분모**(본 사람 수, 프로필 연 수) | X | 이벤트 기록이 없다. analytics 미구현의 실제 손실 |
| 재방문율 | X | `lastSeenAt`이 로그인 때만 갱신되고 세션이 30일. AuthGuard에서 1시간 지났으면 갱신하면 DAU/WAU가 나온다. 제품 철학에는 "돌아와서 무언가 했는가"(쓰기 행동 기준)가 맞다 |
| 요청 만료율 | O | 받은 쪽이 앱을 안 여는 신호 |
| 알림 클릭률 | O | `notification_delivery.clickedAt`. Mattermost 알림이 읽히는지의 유일한 신호 |
| 수락률 감속 발동 인원 | O | 스팸 신호 |
| 관심사 직접 추가 수·병합 비율 | O | R-05 |
| 온보딩 퍼널 단계별 이탈 | O | `user.status`, `mattermost_verification` |

**형태.** 매일 아침 웹훅으로 운영자 채널에 표 하나. cron과 웹훅이 있으니 잡 하나면 된다. docs/14 미결정 "대시보드 형태"의 답으로 충분하다.

## 8. 그 외

- **백업.** `pg_dump` 일 1회를 인스턴스 밖(S3)에. 복원을 한 번 실제로 해본다.
- **운영 환경 변수.** `NODE_ENV=production`이 빠지면 쿠키 `secure`가 안 켜진다. Google OAuth 리디렉션 URI를 운영 도메인으로 등록. 파라미터는 30초 캐시.
- ~~**로그에 OAuth 코드가 남는다.** `RequestLoggerMiddleware`가 `originalUrl`을 그대로 찍어 콜백의 `code=`·`state=`가 들어간다.~~ **닫음(2026-09-10)** `NODE_ENV=production` 이면 쿼리스트링을 지운다.
- **백업 스크립트는 있다**(`deploy/backup.sh`, 2026-09-10). cron 에 거는 것과 복원 리허설이 남았다.
- **운영자 레버가 없어 정지·병합이 SQL 직접 실행이다.**

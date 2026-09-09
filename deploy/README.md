# 배포 — Google Cloud VM 한 대

design/20 §13 기본안(단일 VM + Docker Compose + Caddy)을 GCP 에 올린다. 2026-09-10 결정.
Oracle Cloud 무료 티어는 가입이 막혀 접었다. GCP 는 신규 계정 $300 · 90일 크레딧이 있어
준비 → 공개 2주 → 정리까지 비용이 들지 않는다.

이 폴더에 있는 것:

| 파일 | 역할 |
|---|---|
| `../Dockerfile` | `api`(NestJS + Prisma)와 `web`(Caddy + 정적 번들) 두 이미지 |
| `docker-compose.prod.yml` | db + api + web. 이 파일 옆의 `.env` 를 읽는다 |
| `.env.example` | 채워야 할 값. 복사해서 `.env` 로 |
| `Caddyfile` | TLS 자동 발급, `/api`·`/n` 은 api 로, 나머지는 정적 파일 |
| `api-entrypoint.sh` | 컨테이너 시작 때 `prisma migrate deploy` |
| `fetch-env.sh` | Secret Manager 의 `ssafy-net-env` 를 `deploy/.env` 로 내려받는다 (§5-1) |
| `backup.sh` | 하루 1회 `pg_dump`. cron 에 건다 |

## 0. 계정 문제 — Google OAuth 와 GCP 계정은 달라도 된다

둘은 서로 모른다.

- **Google OAuth 클라이언트**는 어떤 Google 계정의 Cloud 프로젝트에 있어도 된다. 로그인은 브라우저 ↔ Google 사이에서 일어나고, 서버는 `GOOGLE_CLIENT_ID`·`SECRET` 으로 코드를 교환할 뿐이다. 서버가 어느 계정의 VM 에서 도는지는 Google 이 보지 않는다.
- **VM 을 띄우는 GCP 계정**은 결제(크레딧)만 담당한다. OAuth 프로젝트와 같은 계정일 필요가 없다.
- 오히려 **다를 때 유리하다.** $300 크레딧은 결제 계정을 만든 적 없는 Google 계정에만 준다. OAuth 를 만든 계정이 예전에 무료 체험을 썼다면 새 계정으로 VM 을 만드는 편이 낫다.

OAuth 쪽에서 해야 할 것은 둘뿐이다(4단계).

## 1. GCP 계정과 프로젝트

1. [console.cloud.google.com](https://console.cloud.google.com) 에 로그인 → 상단 "무료로 시작하기" → 카드 등록. 90일 또는 $300 소진 시 **자동으로 닫히고 과금되지 않는다**(직접 업그레이드하지 않는 한).
2. 새 프로젝트를 만든다(예: `ssafy-connection`).
3. **API 및 서비스 → 라이브러리 → Compute Engine API** 사용 설정.

## 2. VM

Compute Engine → VM 인스턴스 → 만들기.

| 항목 | 값 | 왜 |
|---|---|---|
| 이름 | `ssafy-net` | |
| 리전 / 영역 | `asia-northeast3` (서울) / `-a` | 서울 캠퍼스 |
| 머신 | **e2-medium** (2 vCPU, 4GB) | design/20 §13 권장 사양. 월 약 $30, 크레딧으로 충당 |
| 부팅 디스크 | **Ubuntu 24.04 LTS x86/64**, 균형 영구 디스크 **40GB** | ARM 이 아니다. 이미지가 x86-64 |
| 방화벽 | **HTTP 트래픽 허용, HTTPS 트래픽 허용** 체크 | 80·443. Let's Encrypt 발급에 80 이 필요하다 |
| 액세스 범위 | **"모든 Cloud API 에 대한 전체 액세스 허용"** | §5-1 Secret Manager 와 `backup.sh` 의 `gcloud storage cp` 가 이 범위를 요구한다. 기본 액세스로 만들었으면 중지 → 수정 → 변경 |

만든 뒤 **외부 IP 를 고정**한다: VPC 네트워크 → IP 주소 → 임시 IP 옆 "고정 IP 로 승격". 안 하면 재시작 때 IP 가 바뀌어 DNS 가 끊긴다.

HTTP/3 까지 쓰려면 방화벽 규칙에 `udp:443` 을 하나 더 열어도 되지만 필수는 아니다.

## 3. 도메인

Caddy 가 인증서를 자동으로 받으려면 도메인이 있어야 한다. 둘 중 하나.

- **산다**: `.kr`·`.com` 연 1~2만 원. 등록 업체 DNS 에서 **A 레코드 → VM 고정 IP**.
- **무료 서브도메인**: [DuckDNS](https://www.duckdns.org) 등. `xxx.duckdns.org` 를 VM IP 로.

`SITE_ADDRESS` 와 `APP_BASE_URL`, `GOOGLE_CALLBACK_URL` 셋 다 이 도메인으로 적는다.

## 4. Google OAuth 리디렉션 URI

[console.cloud.google.com/auth/clients](https://console.cloud.google.com/auth/clients) — **OAuth 클라이언트를 만든 그 계정으로** 들어간다.

1. 기존 웹 클라이언트 → 승인된 리디렉션 URI 에 **`https://<도메인>/api/auth/google/callback`** 추가. 로컬용 `http://localhost:3000/...` 은 그대로 둬도 된다.
2. **OAuth 동의 화면 → 게시 상태를 "프로덕션"** 으로. "테스트" 상태면 테스트 사용자로 등록한 100명까지만 로그인된다. 쓰는 스코프가 `openid email profile` 뿐이라 Google 의 검증 심사는 필요 없고 경고 화면도 뜨지 않는다.

## 5. VM 에서 — Docker 설치와 첫 배포

VM 목록의 **SSH** 버튼(브라우저 터미널)으로 들어간다.

```bash
# Docker
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# 코드
git clone https://github.com/DevJunz/ssafy-net.git && cd ssafy-net

# 환경 변수 — 둘 중 하나
./deploy/fetch-env.sh   # (a) Secret Manager 에서 내려받는다. §5-1 을 먼저 해 둔다
# cp deploy/.env.example deploy/.env && nano deploy/.env   # (b) 손으로 채운다
```

### 5-1. 환경 변수를 Secret Manager 에서 관리 (2026-09-10 채택)

값의 원본을 VM 이 아니라 GCP 에 둔다. VM 을 다시 만들어도 `fetch-env.sh` 한 줄로 복구되고, 값을 바꿀 때 콘솔에서 새 버전만 올리면 된다. 무료 한도(활성 버전 6개, 접근 1만 회/월) 안이다.

1. **API 켜기**: API 및 서비스 → 라이브러리 → **Secret Manager API** 사용 설정.
2. **보안 비밀 만들기**: 보안 → Secret Manager → 보안 비밀 만들기.
   - 이름 `ssafy-net-env`
   - 보안 비밀 값: 로컬에서 채운 `deploy/.env` 파일 내용을 **통째로** 붙여 넣거나 파일 업로드. 위 표의 키가 전부 들어 있어야 한다.
   - 리전은 자동, 나머지 기본값.
3. **VM 서비스 계정에 권한**: 만든 보안 비밀 → 권한 탭 → 주 구성원 추가 → `<프로젝트 번호>-compute@developer.gserviceaccount.com` (IAM 화면에 "Compute Engine 기본 서비스 계정" 으로 보인다) → 역할 **Secret Manager 보안 비밀 접근자**.
4. **VM 액세스 범위**: VM 상세 → "API 및 ID 관리" → Cloud API 액세스 범위가 **"모든 Cloud API 에 대한 전체 액세스 허용"** 이어야 한다. "기본 액세스" 면 VM 을 **중지 → 수정 → 범위 변경 → 시작**. (범위는 켜진 VM 에서 못 바꾼다.)
5. VM 에서 `./deploy/fetch-env.sh`. `deploy/.env` 가 생기고(권한 600) 이후는 (b) 와 같다.

값을 바꿀 때: 보안 비밀 → 새 버전 → 전체 내용을 다시 붙여 넣기 → VM 에서 `./deploy/fetch-env.sh && docker compose -f deploy/docker-compose.prod.yml up -d api`. 공개일 스위치(§9)도 이 절차다.

`deploy/.env` 에 들어갈 것 (손으로 채우든 보안 비밀에 넣든 같다):

| 키 | 값 |
|---|---|
| `SITE_ADDRESS` | 도메인 (예: `connect.example.com`) |
| `APP_BASE_URL` | `https://<도메인>` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 16` |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 로컬 `api/.env` 와 같은 값 |
| `GOOGLE_CALLBACK_URL` | `https://<도메인>/api/auth/google/callback` |
| `MATTERMOST_*` | 로컬 `api/.env` 와 같은 값. **`MATTERMOST_DELIVERY_MODE=redirect` 그대로** |

```bash
# 빌드하고 띄운다 (첫 빌드 5분 안팎)
docker compose -f deploy/docker-compose.prod.yml up -d --build

# 상태. api 가 healthy 가 될 때까지 30~40초
docker compose -f deploy/docker-compose.prod.yml ps
docker compose -f deploy/docker-compose.prod.yml logs -f api

# 시드 — 관심사 100개, 파라미터, 초대 코드. 초대 코드가 출력된다
docker compose -f deploy/docker-compose.prod.yml exec api npm run prisma:seed
```

확인:

```bash
curl -s https://<도메인>/api/health      # {"ok":true,"uptimeSec":...}
```

브라우저에서 `https://<도메인>/invite/<초대코드>` → Google 로그인 → Mattermost 인증(redirect 모드라 코드가 운영자 채널로 온다) → 온보딩 → 그래프.

운영자 계정 켜기 (본인 계정 가입 뒤 한 번):

```bash
docker compose -f deploy/docker-compose.prod.yml exec db \
  psql -U ssafynet -d ssafynet -c "update \"user\" set is_operator = true where email = '<내 Google 이메일>';"
```

## 6. 죽으면 알 수 있게

- **[UptimeRobot](https://uptimerobot.com)** 무료 계정 → HTTP 모니터 `https://<도메인>/api/health`, 5분 간격, 알림은 이메일. 서버가 죽거나 DB 가 끊기면 503 이라 바로 잡힌다.
- 컨테이너는 `restart: unless-stopped` 라 프로세스가 죽으면 Docker 가 다시 띄운다. VM 재부팅 뒤에도 자동으로 올라온다.

## 7. 백업

```bash
chmod +x deploy/backup.sh
crontab -e
# 매일 04:00
0 4 * * * /home/$USER/ssafy-net/deploy/backup.sh >> /home/$USER/backup.log 2>&1
```

VM 밖에도 두려면 Cloud Storage 버킷 하나(서울, Standard)를 만들고 `deploy/.env` 의 `BACKUP_BUCKET` 에 이름을 적는다. **복원을 공개 전에 한 번 해 본다**(`backup.sh` 머리의 명령).

## 8. 갱신

```bash
cd ~/ssafy-net && git pull
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

api 컨테이너가 시작하면서 `prisma migrate deploy` 를 돌리므로 마이그레이션은 따로 하지 않는다.
`packages/shared` 를 고쳤어도 이미지 안에서 처음부터 다시 빌드하니 로컬의 dist 함정은 없다.

## 9. 공개하는 날

1. `MATTERMOST_DELIVERY_MODE=live`. 소수로 먼저 시험하려면 `MATTERMOST_ALLOWED_RECIPIENTS` 에 아이디 몇 개. Secret Manager 를 쓰면 새 버전을 올리고 `./deploy/fetch-env.sh`, 아니면 `deploy/.env` 직접 수정.
2. `docker compose -f deploy/docker-compose.prod.yml up -d api` (api 만 재시작).
3. 운영자 채널에 온 인증 코드가 더는 안 오고 본인 DM 으로 오는지 확인.

## 10. 2주 뒤 정리 (docs/12 §10)

```bash
docker compose -f deploy/docker-compose.prod.yml down -v   # 컨테이너와 DB 볼륨까지 삭제
```

그 다음 GCS 백업 버킷과 VM 을 콘솔에서 지운다. 무료 체험 계정은 90일에 자동으로 닫히지만, 지우지 않으면 그때까지 크레딧을 먹는다.

## 트러블슈팅

| 증상 | 원인 · 처방 |
|---|---|
| `https://` 가 안 열리고 Caddy 로그에 `acme` 오류 | DNS 가 아직 안 퍼졌거나 80 이 막힘. `dig <도메인>` 이 VM IP 를 주는지, 방화벽 HTTP 체크 확인 |
| 로그인 뒤 `redirect_uri_mismatch` | 4단계 URI 를 정확히(`https`, `/api/auth/google/callback`) 넣었는지 |
| 로그인은 되는데 바로 풀림 | `APP_BASE_URL` 이 `https://` 인지. 쿠키가 `secure` 라 http 에서는 안 붙는다 |
| api 가 `unhealthy` | `logs api`. 대개 `DATABASE_URL`(비밀번호에 특수문자) 또는 migrate 실패 |
| Mattermost 인증 코드가 안 옴 | redirect 모드면 운영자 채널을 본다. 웹훅 URL 과 "채널로 잠금 해제" 확인(README) |

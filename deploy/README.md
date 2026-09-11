# 배포 — Google Cloud VM 한 대

design/20 §13 기본안(단일 VM + Docker Compose + Caddy)을 GCP 에 올린다. 2026-09-10 결정.
Oracle Cloud 무료 티어는 가입이 막혀 접었다. GCP 는 신규 계정 $300 · 90일 크레딧이 있어
준비 → 공개 2주 → 정리까지 비용이 들지 않는다.

**이 배포의 실제 값 (2026-09-10)**

| 항목 | 값 |
|---|---|
| GCP 프로젝트 | `ssanecting` |
| VM | `ssafy-net`, asia-northeast3, e2-medium, Ubuntu 24.04 x86-64, 40GB, 액세스 범위 "모든 Cloud API" |
| 고정 IP | `35.216.40.235` (`ssafy-net-ip`) |
| 도메인 | `ssafy-networking.store` → A 레코드 `35.216.40.235` |
| 환경 변수 | Secret Manager `ssafy-net-env` (§5-1). 로컬 `deploy/.env` 와 같은 내용 |
| OAuth 리디렉션 URI | `https://ssafy-networking.store/api/auth/google/callback` (추가됨) |
| 이미지 | Artifact Registry `asia-northeast3-docker.pkg.dev/ssanecting/ssafy-net/{api,web}` (§5-2). GitHub Actions 가 올리고 VM 은 `deploy.sh` 로 받는다 |
| 개발 서버 | VM `ssafy-net-dev` · `dev.ssafy-networking.store` · 보안 비밀 `ssafy-net-env-dev` · 브랜치 `dev` → 이미지 태그 `dev` (§11). 고정 IP 는 만든 뒤 여기에 적는다 |

**흐름.** `git push` → GitHub Actions 가 이미지 둘을 빌드해 Artifact Registry 에 올린다 → VM 의 cron(`auto-deploy.sh`)이 2분 안에 알아채고 `deploy.sh` 로 받아 띄운다 → 운영자 채널에 한 줄. VM 에서는 빌드하지 않고, 손으로 할 것도 없다(2026-09-10 채택, design/20 §13, §8). **개발 서버도 같은 길이다(§11).** `dev` 브랜치에 푸시하면 태그 `dev` 로 올라가고 개발 VM 이 받는다. VM 은 체크아웃한 브랜치를 따라간다 — main 이면 latest, dev 면 dev.

이 폴더에 있는 것:

| 파일 | 역할 |
|---|---|
| `../Dockerfile` | `api`(NestJS + Prisma)와 `web`(Caddy + 정적 번들) 두 이미지 |
| `../.github/workflows/build.yml` | main·dev 푸시마다 두 이미지를 빌드해 Artifact Registry 에 `<짧은 sha>` 와 이동 태그(main → `latest`, dev → `dev`)로 올린다 |
| `docker-compose.prod.yml` | db + api + web. 이미지는 레지스트리에서. 이 파일 옆의 `.env` 를 읽는다 |
| `docker-compose.build.yml` | 비상용. VM 에서 직접 빌드할 때 prod 파일 위에 겹친다(§8) |
| `deploy.sh` | 배포. 로그인 → pull → up → healthy 대기 → 운영자 채널에 한 줄. VM 이 체크아웃한 브랜치의 이동 태그를 받는다. `IMAGE_TAG=<sha>` 로 롤백(고정) |
| `auto-deploy.sh` | VM cron 이 2분마다. 레지스트리의 이동 태그(latest 또는 dev)가 바뀌었으면 `deploy.sh`. `deploy/.pin` 이 있으면 쉰다(§8) |
| `.env.example` | 채워야 할 값. 복사해서 `.env` 로 |
| `Caddyfile` | TLS 자동 발급, `/api`·`/n` 은 api 로, 나머지는 정적 파일 |
| `api-entrypoint.sh` | 컨테이너 시작 때 `prisma migrate deploy` |
| `fetch-env.sh` | Secret Manager 의 `ssafy-net-env`(main) 또는 `ssafy-net-env-dev`(dev 브랜치)를 `deploy/.env` 로 내려받는다 (§5-1, §11) |
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
| 액세스 범위 | **"모든 Cloud API 에 대한 전체 액세스 허용"** | §5-1 Secret Manager, §5-2 의 이미지 pull, `backup.sh` 의 `gcloud storage cp` 가 이 범위를 요구한다. 기본 액세스로 만들었으면 중지 → 수정 → 변경 |

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

Compute Engine → VM 인스턴스 → `ssafy-net` 행의 **SSH** 버튼(브라우저 터미널)으로 들어간다. **프롬프트가 `<계정>@ssafy-net:~$` 여야 한다.** `<계정>@cloudshell:~ (ssanecting)$` 이면 Cloud Shell 이다 — 거기는 콘솔 명령(§5-2)을 치는 곳이지 서버가 아니다. 이 절의 명령은 전부 VM 에서 한다.

```bash
# Docker
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# 코드 — compose 파일과 스크립트 때문에 필요하다. 빌드는 여기서 하지 않는다.
# 저장소가 private 이라 배포 키(이 저장소만, 읽기 전용)로 받는다. 키 만들기는 한 번만.
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -C "ssafy-net-vm"
cat ~/.ssh/id_ed25519.pub
#   ↑ 이 한 줄(ssh-ed25519 로 시작)을 GitHub 저장소 → Settings → Deploy keys → Add deploy key 에 넣는다.
#     Title: ssafy-net-vm, "Allow write access" 는 끈 채로. 로컬에서 gh 로 넣어도 된다:
#     gh repo deploy-key add <공개키를 저장한 파일> --title ssafy-net-vm
ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts
git clone git@github.com:DevJunz/ssafy-net.git && cd ssafy-net

# 환경 변수 — 둘 중 하나
./deploy/fetch-env.sh   # (a) Secret Manager 에서 내려받는다. §5-1 을 먼저 해 둔다
# cp deploy/.env.example deploy/.env && nano deploy/.env   # (b) 손으로 채운다

# 배포 — 레지스트리에서 이미지를 받아 띄운다. §5-2 를 먼저 해 두고, Actions 가 한 번 초록불이어야 한다
./deploy/deploy.sh
```

### 5-1. 환경 변수를 Secret Manager 에서 관리 (2026-09-10 채택)

값의 원본을 VM 이 아니라 GCP 에 둔다. VM 을 다시 만들어도 `fetch-env.sh` 한 줄로 복구되고, 값을 바꿀 때 콘솔에서 새 버전만 올리면 된다. 무료 한도(활성 버전 6개, 접근 1만 회/월) 안이다.

1. **API 켜기**: API 및 서비스 → 라이브러리 → **Secret Manager API** 사용 설정.
2. **보안 비밀 만들기**: 보안 → Secret Manager → 보안 비밀 만들기.
   - 이름 `ssafy-net-env`
   - 보안 비밀 값: 로컬에서 채운 `deploy/.env` 파일 내용을 **통째로** 붙여 넣거나 파일 업로드. 위 표의 키가 전부 들어 있어야 한다.
   - 리전은 자동, 나머지 기본값.
3. **VM 서비스 계정에 권한**: 만든 보안 비밀 → 권한 탭 → 주 구성원 추가 → `<프로젝트 번호>-compute@developer.gserviceaccount.com` (IAM 화면에 "Compute Engine 기본 서비스 계정" 으로 보인다) → 역할 **Secret Manager 보안 비밀 접근자**. 콘솔에서 헤매면 Cloud Shell 에서 한 줄(2026-09-10 에 콘솔로 넣은 것이 붙지 않아 이걸로 했다):

   ```bash
   gcloud secrets add-iam-policy-binding ssafy-net-env \
     --member="serviceAccount:543998929768-compute@developer.gserviceaccount.com" --role=roles/secretmanager.secretAccessor
   ```
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

### 5-2. 이미지를 Artifact Registry 로 (2026-09-10 채택)

빌드는 GitHub Actions 가 하고 VM 은 받기만 한다. 이유: 4GB VM 에서 빌드하지 않는다, 배포가 5분 빌드에서 30초 pull 로 준다, 롤백이 태그 하나로 된다(`IMAGE_TAG=<sha>`), Actions 가 타입 검사·빌드 게이트를 겸한다. Docker Hub 대신 같은 프로젝트의 Artifact Registry 를 쓰는 이유: 저장소가 private 이라 이미지도 private 이어야 하는데 Docker Hub 무료는 private 저장소가 하나뿐이고 VM 에 토큰을 둬야 한다. Artifact Registry 는 VM 서비스 계정이 그대로 pull 하고, 같은 리전이라 전송이 빠르며, 2주 뒤 프로젝트와 함께 지워진다. 저장 0.5GB 까지 무료, 그 뒤 GB 당 월 $0.10.

**한 번만 한다 — 콘솔 오른쪽 위 `>_` (Cloud Shell) 에 붙여 넣기.** VM 의 SSH 터미널이 **아니다**. VM 안의 gcloud 는 VM 서비스 계정으로 돌아서 권한 부여(`add-iam-policy-binding`)가 `PERMISSION_DENIED ... setIamPolicy` 로 거부된다. Cloud Shell 은 본인 계정(프로젝트 소유자)으로 돈다. 이미 만들어진 것이 있으면 `ALREADY_EXISTS` 가 나오는데 무시하면 된다.

```bash
PROJECT=$(gcloud config get-value project); echo "project: $PROJECT"   # ssanecting 이어야 한다. 다르면 build.yml 과 compose 의 IMAGE_REPO 를 고친다
REGION=asia-northeast3
gcloud services enable artifactregistry.googleapis.com
gcloud artifacts repositories create ssafy-net --repository-format=docker --location=$REGION --description="SSAFY Connection images"

# GitHub Actions 가 올릴 때 쓰는 서비스 계정 — 이 저장소에 쓰기만
gcloud iam service-accounts create gh-actions --display-name="GitHub Actions image push"
gcloud artifacts repositories add-iam-policy-binding ssafy-net --location=$REGION \
  --member="serviceAccount:gh-actions@$PROJECT.iam.gserviceaccount.com" --role=roles/artifactregistry.writer
gcloud iam service-accounts keys create ~/gh-actions-key.json --iam-account="gh-actions@$PROJECT.iam.gserviceaccount.com"

# VM 서비스 계정 — 읽기만
PROJECT_NUMBER=$(gcloud projects describe $PROJECT --format='value(projectNumber)')
gcloud artifacts repositories add-iam-policy-binding ssafy-net --location=$REGION \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" --role=roles/artifactregistry.reader
```

그 다음 키를 GitHub 저장소 secret `GCP_SA_KEY` 에 넣는다. 둘 중 하나.

- **웹으로(내려받기 없음).** Cloud Shell 에서 `cat ~/gh-actions-key.json` → 출력 전체(`{` 부터 `}` 까지) 복사 → GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret → 이름 `GCP_SA_KEY`, 값에 붙여 넣기.
- **CLI 로.** Cloud Shell 에서 `cloudshell download ~/gh-actions-key.json` 으로 내려받고 로컬에서:

  ```bash
  gh secret set GCP_SA_KEY < gh-actions-key.json                       # Git Bash
  Get-Content .\gh-actions-key.json -Raw | gh secret set GCP_SA_KEY    # PowerShell
  ```

  넣었으면 로컬 사본을 지운다.

어느 쪽이든 끝나면 Cloud Shell 의 것도 지운다: `rm ~/gh-actions-key.json`.

키는 2주 뒤 정리 때 서비스 계정과 함께 지운다(§10). 이제 main 에 푸시하면 Actions 탭에 `build-images` 가 돈다. 문서만 바뀐 커밋은 돌지 않는다. 손으로 돌리려면 `gh workflow run build.yml`.

이미지 이름은 `asia-northeast3-docker.pkg.dev/ssanecting/ssafy-net/api:<짧은 sha>` 와 `.../web:<짧은 sha>`. 둘 다 `latest` 태그도 받는다. Actions 실행 요약(Summary)에 배포 명령이 sha 와 함께 찍힌다.

```bash
# 첫 배포. 로그인(VM 서비스 계정 토큰) → pull → up → api 가 healthy 가 될 때까지 최대 2분 기다린다
./deploy/deploy.sh

# 상태와 로그
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

운영자 계정 켜기 (본인 계정 가입 뒤 한 번. 그 다음 운영자는 `/ops` 관리 탭에서 이메일로 추가한다):

```bash
docker compose -f deploy/docker-compose.prod.yml exec db \
  psql -U ssafynet -d ssafynet -c "update \"user\" set is_operator = true where email = '<내 Google 이메일>';"
```

## 6. 죽으면 알 수 있게

- **[UptimeRobot](https://uptimerobot.com)** 무료 계정 → HTTP 모니터 `https://<도메인>/api/health`, 5분 간격, 알림은 이메일. 서버가 죽거나 DB 가 끊기면 503 이라 바로 잡힌다.
- 컨테이너는 `restart: unless-stopped` 라 프로세스가 죽으면 Docker 가 다시 띄운다. VM 재부팅 뒤에도 자동으로 올라온다.

## 7. 백업

VM 에서. 첫 줄은 손으로 한 번 돌려 보는 것이고, 둘째는 매일 04:00 에 돌게 cron 에 거는 것이다(편집기 없이 붙여 넣기만으로 된다).

```bash
cd ~/ssafy-net && ./deploy/backup.sh          # deploy/backups/ssafynet-<stamp>.sql.gz 가 생긴다
( crontab -l 2>/dev/null; echo "PATH=/usr/local/bin:/usr/bin:/bin:/snap/bin"; echo "0 4 * * * $HOME/ssafy-net/deploy/backup.sh >> $HOME/backup.log 2>&1" ) | crontab -
crontab -l                                    # 두 줄이 보이면 된 것
```

`PATH` 줄은 cron 의 기본 PATH 에 `/snap/bin`(gcloud)이 없어서 넣는다. 없으면 버킷 업로드만 조용히 실패한다.

**복원 리허설 — 공개 전에 한 번.** 운영 DB 는 건드리지 않고 빈 DB 를 만들어 거기에 풀어 본다.

```bash
C="docker compose -f deploy/docker-compose.prod.yml"
$C exec db createdb -U ssafynet ssafynet_restore
gunzip -c deploy/backups/ssafynet-*.sql.gz | $C exec -T db psql -q -U ssafynet -d ssafynet_restore
$C exec db psql -U ssafynet -d ssafynet_restore -c 'select (select count(*) from "user") as users, (select count(*) from interest) as interests;'
$C exec db dropdb -U ssafynet ssafynet_restore
```

`interests` 가 100 이상이고 `users` 가 가입자 수와 맞으면 백업이 살아 있는 것이다. 파일이 둘 이상이면 `ssafynet-*` 대신 하나를 고른다.

**실제 복원(사고 때).** api 를 멈추고 DB 를 비운 뒤 풀고 다시 띄운다. 덤프에 마이그레이션 이력표가 들어 있어 api 가 시작할 때 `migrate deploy` 는 할 일이 없다.

```bash
$C stop api
$C exec db psql -U ssafynet -d postgres -c 'drop database ssafynet; create database ssafynet;'
gunzip -c deploy/backups/ssafynet-<stamp>.sql.gz | $C exec -T db psql -q -U ssafynet -d ssafynet
$C start api
```

**VM 밖에도 두려면(권장, 5분).** VM 디스크가 죽으면 `deploy/backups/` 도 같이 죽는다. Cloud Shell 에서 버킷을 만들고, 보안 비밀에 `BACKUP_BUCKET=<버킷 이름>` 한 줄을 더한 새 버전을 올린 뒤 VM 에서 `./deploy/fetch-env.sh`. 다음 백업부터 `gs://` 에도 올라간다.

```bash
gcloud storage buckets create gs://ssanecting-backups --location=asia-northeast3 --uniform-bucket-level-access
```

## 8. 갱신과 롤백 — 자동 배포

**main 에 푸시하면 끝이다.** Actions 가 이미지를 올리면 VM 의 cron 이 2분 안에 알아채고 `deploy.sh` 를 돌린다(`auto-deploy.sh`, 2026-09-10 채택). 끝나면 운영자 채널에 "[deploy] 배포됨 — 커밋 …" 한 줄이 온다. 실패해도 한 줄이 온다. 개발 서버(§11)는 `dev` 브랜치로 같은 일을 하고 "[deploy:dev]" 로 온다.

밖에서 VM 으로 들어오는 길(SSH 키를 GitHub 에 두는 방식)을 열지 않고 VM 이 스스로 당겨온다. 인증은 이미 있는 VM 서비스 계정(§5-2 리더 역할)뿐이다. 레지스트리의 이동 태그(`api:latest`, 개발 VM 은 `api:dev`) 지문을 지금 받아 둔 것과 비교하므로 문서만 바뀐 커밋(이미지가 안 만들어진다)은 아무 일도 하지 않는다. 배포 때 저장소는 `git pull` 이 아니라 `origin/<브랜치>` 에 맞춘다(`reset --hard`) — VM 에서 파일을 만졌어도 배포가 서지 않는다. `deploy/.env`·`.pin`·`backups/` 는 git 밖이라 그대로다.

**설치 — VM 에서 한 번:**

```bash
cd ~/ssafy-net && git pull
( crontab -l 2>/dev/null; echo "*/2 * * * * $HOME/ssafy-net/deploy/auto-deploy.sh >> $HOME/deploy.log 2>&1" ) | crontab -
crontab -l                      # 줄이 보이면 된 것. 2분 안에 첫 배포가 돈다
tail -f ~/deploy.log            # 지켜보기. Ctrl+C 로 나온다
```

**롤백 = 고정.** 특정 커밋(Actions 요약의 짧은 sha)을 지정해 돌리면 그 이미지로 바뀌고 `deploy/.pin` 이 생겨 자동 배포가 멈춘다. 고친 커밋을 푸시한 뒤 태그 없이 한 번 돌리면 latest 로 돌아오고 자동 배포도 다시 켜진다.

```bash
IMAGE_TAG=1a2b3c4 ./deploy/deploy.sh   # 이 커밋으로. 자동 배포 멈춤
./deploy/deploy.sh                     # latest 로. 자동 배포 재개 (rm deploy/.pin 만 해도 재개된다)
```

api 컨테이너가 시작하면서 `prisma migrate deploy` 를 돌리므로 마이그레이션은 따로 하지 않는다. 롤백할 때 마이그레이션은 되돌아가지 않는다 — 옛 코드가 새 스키마 위에서 돌 수 있는지 보고 한다(컬럼 추가 정도는 문제없다).
`packages/shared` 를 고쳤어도 이미지 안에서 처음부터 다시 빌드하니 로컬의 dist 함정은 없다.

**뜻하는 것.** main 의 초록불 커밋은 전부 몇 분 안에 실제 서비스가 된다. 공개 뒤에는 main 에 올리는 것이 곧 배포임을 알고 올린다. 시험이 필요한 것은 `dev` 에 올려 개발 서버(§11)에서 보고, 잠깐 멈추고 싶으면 그 VM 에서 `touch deploy/.pin`.

**비상 — Actions 가 안 될 때 VM 에서 직접 빌드:**

```bash
docker compose -f deploy/docker-compose.prod.yml -f deploy/docker-compose.build.yml up -d --build
```

5분 안팎이고 4GB 에서 메모리가 빠듯할 수 있다. 다음 `deploy.sh` 가 레지스트리 이미지로 덮는다.

## 9. 공개하는 날

1. `MATTERMOST_DELIVERY_MODE=live`. 소수로 먼저 시험하려면 `MATTERMOST_ALLOWED_RECIPIENTS` 에 아이디 몇 개. Secret Manager 를 쓰면 새 버전을 올리고 `./deploy/fetch-env.sh`, 아니면 `deploy/.env` 직접 수정.
2. `docker compose -f deploy/docker-compose.prod.yml up -d api` (api 만 재시작).
3. 운영자 채널에 온 인증 코드가 더는 안 오고 본인 DM 으로 오는지 확인.

## 10. 2주 뒤 정리 (docs/12 §10)

```bash
docker compose -f deploy/docker-compose.prod.yml down -v   # 컨테이너와 DB 볼륨까지 삭제
```

그 다음 GCS 백업 버킷과 VM 을 콘솔에서 지운다(개발 VM `ssafy-net-dev` 와 그 고정 IP, 보안 비밀 `ssafy-net-env-dev` 도). 무료 체험 계정은 90일에 자동으로 닫히지만, 지우지 않으면 그때까지 크레딧을 먹는다. Artifact Registry 저장소와 서비스 계정 `gh-actions`(키 포함)도 지우고, GitHub 의 `GCP_SA_KEY` secret 을 삭제한다. 프로젝트째 지우면 GitHub secret 만 남는다.

## 11. 개발 서버 — 더미 데이터로 배포 전에 본다 (2026-09-10 채택)

운영 VM 과 똑같은 VM 을 하나 더 두고, 더미 사용자를 채워 놓고, `dev` 브랜치를 올리면 거기에 뜬다. 확인이 끝나면 main 에 합쳐 운영으로 보낸다. 운영 DB 는 건드리지 않는다. (디자이너용 Vercel 데모 배포는 이것으로 대신하고 없앴다.)

| | 운영 | 개발 |
|---|---|---|
| 브랜치 → 이미지 태그 | `main` → `latest` | `dev` → `dev` |
| VM | `ssafy-net` | `ssafy-net-dev`. 같은 사양이 편하다. 아끼려면 e2-small 도 된다 — 빌드는 여기서 안 하니 2GB 면 돈다 |
| 도메인 | `ssafy-networking.store` | `dev.ssafy-networking.store` |
| 보안 비밀 | `ssafy-net-env` | `ssafy-net-env-dev` (`APP_ENV=dev` 가 추가로 들어간다) |
| 데이터 | 실제 사용자 | `prisma:seed` + `seed:dev` 더미 100명(`SEED_USERS=100`, 상태를 보기에 이 정도가 좋다. 공개 규모를 보려면 1000) |
| Mattermost | `live` (2026-09-10 부터, 공개 전 시험도 실제 DM 으로) | `live` (사용자 결정 2026-09-10). 더미는 Mattermost 아이디가 가짜라 발송이 400 으로 끝나고, 초대 링크를 아는 사람은 가입할 수 있다. 잠그고 싶으면 `redirect` 로 돌리거나 `MATTERMOST_ALLOWED_RECIPIENTS` 에 시험 인원만 |
| 배포 알림 | `[deploy] …` | `[deploy:dev] …` |
| 화면 | | 위에 "개발 서버" 띠(호스트 이름이 `dev.` 로 시작하면) |

**VM 은 체크아웃한 브랜치를 따라간다.** `deploy.sh`·`auto-deploy.sh`·`fetch-env.sh` 가 현재 브랜치를 보고 이동 태그와 보안 비밀 이름을 고른다(main → `latest`·`ssafy-net-env`, dev → `dev`·`ssafy-net-env-dev`). 개발 VM 에 `-b dev` 로 clone 하는 것이 설정의 전부다.

### 만들기 — 한 번

**콘솔(브라우저)에서**

1. §2 와 같은 VM 을 이름만 `ssafy-net-dev` 로 만든다(액세스 범위 "모든 Cloud API", HTTP·HTTPS 허용). 외부 IP 를 고정으로 승격하고 위 표에 적는다.
2. DNS: A 레코드 `dev` → 그 IP.
3. OAuth(§4 의 계정): 승인된 리디렉션 URI 에 `https://dev.ssafy-networking.store/api/auth/google/callback` 추가. 같은 클라이언트에 둘이 있어도 된다.
4. Secret Manager: 보안 비밀 `ssafy-net-env-dev` 를 만든다. 내용은 운영 것에서 셋을 `dev.` 주소로 바꾸고(`SITE_ADDRESS`·`APP_BASE_URL`·`GOOGLE_CALLBACK_URL`), 둘을 새 값으로(`POSTGRES_PASSWORD`·`SESSION_SECRET`), 하나를 더한 것이다(`APP_ENV=dev`). 로컬에 운영 `deploy/.env` 가 있으면 아래 한 줄(Git Bash)이 `deploy/.env.dev` 를 만든다. git 에는 안 들어간다. 그 파일을 업로드하거나 내용을 붙여 넣는다.

   ```bash
   tr -d '\r' < deploy/.env | sed -e 's#ssafy-networking\.store#dev.ssafy-networking.store#g' \
       -e "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=$(openssl rand -hex 16)#" \
       -e "s#^SESSION_SECRET=.*#SESSION_SECRET=$(openssl rand -hex 32)#" > deploy/.env.dev \
     && printf '\n# 개발 서버 표시. seed:dev 가 이 값을 본다(README §11)\nAPP_ENV=dev\n' >> deploy/.env.dev
   ```

   웹훅은 운영과 같은 것을 써도 된다. 알림이 섞이는 것이 싫으면 Mattermost 에서 웹훅을 하나 더 만들어(다른 채널로) `MATTERMOST_WEBHOOK_URL` 만 바꾼다.

**Cloud Shell(`@cloudshell` 프롬프트)에서** — VM 서비스 계정에 새 보안 비밀의 접근 권한. 레지스트리 reader 는 같은 서비스 계정이라 이미 있다.

```bash
gcloud secrets add-iam-policy-binding ssafy-net-env-dev \
  --member="serviceAccount:543998929768-compute@developer.gserviceaccount.com" --role=roles/secretmanager.secretAccessor
```

**개발 VM 의 SSH(`@ssafy-net-dev` 프롬프트)에서** — §5 와 같고 clone 에 `-b dev` 가 붙는다. 그 전에 `dev` 브랜치로 Actions 가 한 번은 초록불이어야 태그 `dev` 가 있다. 브랜치를 새로 만든 첫 푸시는 `paths-ignore` 때문에 Actions 가 안 돈다(비교할 앞 커밋이 없다) — 그때는 로컬에서 `gh workflow run build.yml --ref dev`. 2026-09-10 에 그렇게 했고, 이후 푸시는 저절로 돈다.

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -C "ssafy-net-dev-vm"
cat ~/.ssh/id_ed25519.pub        # → GitHub Deploy keys 에 추가 (Title: ssafy-net-dev-vm, 쓰기 없이). 운영 VM 의 키와 별개다
ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts
git clone -b dev git@github.com:DevJunz/ssafy-net.git && cd ssafy-net

./deploy/fetch-env.sh            # dev 브랜치라 ssafy-net-env-dev 를 받는다
./deploy/deploy.sh               # 태그 dev 를 받아 띄운다
docker compose -f deploy/docker-compose.prod.yml exec api npm run prisma:seed   # 관심사·파라미터·초대 코드(출력된다)
```

브라우저에서 `https://dev.ssafy-networking.store/invite/<초대코드>` 로 본인 가입·온보딩(인증 코드는 운영자 채널로). 그 뒤 다시 개발 VM 에서:

```bash
# 운영자 플래그
docker compose -f deploy/docker-compose.prod.yml exec db \
  psql -U ssafynet -d ssafynet -c "update \"user\" set is_operator = true where email = '<내 Google 이메일>';"
# 더미 100명 — 가중치 있는 관심사 분포 + 내 주변 클러스터 5명. 본인 가입 뒤에 돌려야 클러스터가 붙는다.
# 다시 돌리면 더미만 갈아엎는다(본인 계정은 그대로). 공개 규모를 보고 싶으면 SEED_USERS=1000
docker compose -f deploy/docker-compose.prod.yml exec -e SEED_USERS=100 api npm run seed:dev
# 자동 배포
( crontab -l 2>/dev/null; echo "*/2 * * * * $HOME/ssafy-net/deploy/auto-deploy.sh >> $HOME/deploy.log 2>&1" ) | crontab -
```

`seed:dev` 는 `APP_ENV=dev` 가 없으면 "운영으로 보인다" 며 멈춘다. 운영 VM 창에 잘못 붙여 넣어도 아무 일이 없다.

### 내용(분류·관심사·질문)을 갈아 끼울 때

이미 돌고 있는 개발 서버의 관심사 목록이 옛것일 때. `prisma:seed` 는 upsert 라 옛 관심사가 남으므로 **통째 교체**를 쓴다.

```bash
cd ~/ssafy-net
C=deploy/docker-compose.prod.yml
docker compose -f $C exec api npm run content:import -- prisma/content.json --dry-run  # 무엇이 바뀌는지만
docker compose -f $C exec api npm run content:import -- prisma/content.json           # 실제 교체
```

**교체하면 모든 사용자의 관심사 선택과 글, 노출된 네트워크 추천이 사라진다.** 계정·연결·알림은 남는다. 그래서 순서가 있다:

1. `content:import` — 목록을 갈아 끼운다
2. 브라우저에서 **본인 계정의 관심사를 다시 고른다**(`/profile`). 이걸 먼저 해야 다음 단계가 내 주변 클러스터를 만든다
3. `docker compose -f $C exec -e SEED_USERS=100 api npm run seed:dev` — 더미를 새 목록으로 다시 만든다
4. `/ops` → 제품 → Network → **지금 다시 계산**(또는 "후보 기준값"의 미리보기)

2 를 건너뛰면 `seed:dev` 가 "관심사가 비어 있어 주변 클러스터를 만들지 않았다" 고 알리고 넘어간다.

### 쓰기 — 매번

```bash
git checkout dev && git merge main     # main 에 직접 올린 것이 있으면 먼저 가져온다
# ... 작업, 커밋 ...
git push origin dev                    # → Actions → 2분 안에 개발 서버
# dev.ssafy-networking.store 에서 확인한 뒤
git checkout main && git merge --ff-only dev && git push origin main   # → 운영
```

마이그레이션이 든 커밋은 개발 서버에서 먼저 돌아 보는 셈이다(api 가 시작하면서 `migrate deploy`). 운영에 올리기 전에 개발 VM 의 `~/deploy.log` 에 오류가 없는지 본다.

개발 서버의 데이터를 처음부터 다시 만들려면 개발 VM 에서 `docker compose -f deploy/docker-compose.prod.yml down -v && ./deploy/deploy.sh` 뒤에 위의 시드 순서. **운영 VM 에서는 치지 않는다** — `-v` 가 DB 를 지운다.

## 트러블슈팅

| 증상 | 원인 · 처방 |
|---|---|
| `https://` 가 안 열리고 Caddy 로그에 `acme` 오류 | DNS 가 아직 안 퍼졌거나 80 이 막힘. `dig <도메인>` 이 VM IP 를 주는지, 방화벽 HTTP 체크 확인 |
| 로그인 뒤 `redirect_uri_mismatch` | 4단계 URI 를 정확히(`https`, `/api/auth/google/callback`) 넣었는지 |
| 로그인은 되는데 바로 풀림 | `APP_BASE_URL` 이 `https://` 인지. 쿠키가 `secure` 라 http 에서는 안 붙는다 |
| api 가 `unhealthy` | `logs api`. 대개 `DATABASE_URL`(비밀번호에 특수문자) 또는 migrate 실패 |
| Mattermost 인증 코드가 안 옴 | redirect 모드면 운영자 채널을 본다. 웹훅 URL 과 "채널로 잠금 해제" 확인(README) |
| `add-iam-policy-binding` 이 `PERMISSION_DENIED ... setIamPolicy`, 끝에 `authenticated as <번호>-compute@...` | VM SSH 에서 돌린 것이다. VM 서비스 계정은 권한을 못 준다. 같은 명령을 콘솔의 Cloud Shell 에서 |
| `git clone` 이 Username 을 묻고 `Password authentication is not supported` | 저장소가 private 이다. §5 의 배포 키(ssh-keygen → Deploy keys → `git@github.com:` 주소). 계정 비밀번호로는 안 된다 |
| `./deploy/deploy.sh: No such file or directory` | clone 이 안 됐거나 Cloud Shell 에 있다. 프롬프트를 본다(§5 머리) |
| Actions 가 `secret 확인` 에서 실패 | `GCP_SA_KEY` 가 없다. §5-2 의 `gh secret set` |
| Actions 가 `login` 에서 실패 | 키 JSON 이 통째로 들어갔는지(`gh secret set ... < 파일`). 서비스 계정에 저장소 writer 역할이 있는지 |
| `fetch-env.sh` 가 `PERMISSION_DENIED: Permission 'secretmanager.versions.access'` | VM 서비스 계정에 접근자 역할이 없다. §5-1 3번의 Cloud Shell 한 줄. 보안 비밀이 없으면 `gcloud secrets list` 로 이름부터 확인 |
| `deploy.sh` 가 `registry login` 에서 실패 | VM 액세스 범위가 "모든 Cloud API" 인지(§2), gcloud 가 있는지(`gcloud --version`) |
| `deploy.sh` 의 pull 이 `denied` 또는 `permission` | VM 서비스 계정(`<번호>-compute@`)에 저장소 reader 역할(§5-2 마지막 명령) |
| pull 이 `manifest unknown` | 그 sha 로 이미지가 없다. 문서만 바뀐 커밋이거나 Actions 가 아직 안 끝났다. `latest` 나 Actions 요약의 sha 를 쓴다. 개발 VM 에서 태그 `dev` 가 없다면 `dev` 브랜치로 Actions 가 아직 한 번도 안 돈 것이다 |
| 개발 서버가 운영 이미지를 받거나 운영 서버가 `dev` 를 받는다 | VM 이 체크아웃한 브랜치가 다르다. `git branch --show-current` 가 운영은 `main`, 개발은 `dev` 여야 한다. 개발 VM 은 `git checkout dev && ./deploy/deploy.sh` |
| **API 는 새 코드인데 화면만 옛것**(`/api/parameters` 는 바뀌었는데 새 버튼이 없다) | api·web 이 어긋났다. `./deploy/deploy.sh` 를 한 번 돌리면 맞는다. 2026-09-10 개발 서버가 그랬다 — `auto-deploy.sh` 가 api 지문만 봤고 Actions 가 api 를 먼저 올려, 그 13초 사이에 낀 cron 이 새 api + 옛 web 으로 띄운 뒤 지문이 같아져 다시 돌지 않았다. 지금은 두 이미지를 다 만든 뒤 이동 태그를 붙이고(build.yml "이동 태그"), `auto-deploy.sh` 도 둘 다 본다 |
| `seed:dev` 가 "운영으로 보인다" 며 멈춤 | 개발 VM 이면 보안 비밀 `ssafy-net-env-dev` 에 `APP_ENV=dev` 가 있는지 → `./deploy/fetch-env.sh && docker compose -f deploy/docker-compose.prod.yml up -d api`. 운영 VM 이면 멈춘 것이 맞다 |

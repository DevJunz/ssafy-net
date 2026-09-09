# syntax=docker/dockerfile:1
#
# 운영 이미지 두 개를 한 파일에서 만든다(design/20 §13).
#
#   --target api   NestJS + Prisma. 시작할 때 migrate deploy 를 돌린다(deploy/api-entrypoint.sh).
#   --target web   Caddy 가 정적 번들을 서빙하고 /api, /n 을 api 로 넘긴다(deploy/Caddyfile).
#
# 빌드는 deploy/docker-compose.prod.yml 이 한다. 직접 하려면:
#   docker build --target api -t ssafy-net-api .
#   docker build --target web -t ssafy-net-web .
#
# 이미지는 x86-64 다(GCP e2-medium). ARM VM 을 쓰게 되면 그 VM 위에서 빌드하면 된다.

# ── 의존성 ─────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
# prisma generate 가 OpenSSL 버전을 읽어 엔진을 고른다. 없으면 1.1.x 로 잘못 추정한다.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# 워크스페이스 매니페스트만 먼저 복사해 npm ci 층을 캐시한다.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci

# ── 빌드: shared → prisma client → api → web ──────────────────────────
FROM deps AS build
COPY packages/shared packages/shared
COPY api api
COPY web web
# shared 는 CJS/ESM 듀얼 빌드라 api·web 보다 먼저 만든다(CLAUDE.md "함정").
# prisma generate 는 이 단계의 OS(bookworm, openssl 3)에 맞는 엔진을 받는다. 런타임도 같은 베이스를 쓴다.
RUN npm run build --workspace=@ssafy-net/shared \
 && npx prisma generate --schema=api/prisma/schema.prisma \
 && npm run build --workspace=api \
 && npm run build --workspace=web \
 && mkdir -p api/node_modules

# ── api 런타임 ──────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production \
    TZ=Asia/Seoul
# openssl: Prisma 엔진. tzdata: TZ=Asia/Seoul (하루 단위 파라미터의 기준, design/20 §13).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# node_modules 는 전부 가져온다. prisma CLI(migrate deploy)와 ts-node(시드)가 devDependencies 라
# --omit=dev 로 줄이면 시작이 안 된다. 이 규모에서 이미지 크기는 문제가 아니다.
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/api/package.json /app/api/tsconfig.json ./api/
COPY --from=build /app/api/node_modules ./api/node_modules
COPY --from=build /app/api/dist ./api/dist
COPY --from=build /app/api/prisma ./api/prisma
COPY deploy/api-entrypoint.sh /usr/local/bin/api-entrypoint
# Windows 에서 체크아웃하면 CRLF 가 붙을 수 있다. 셸이 \r 를 못 읽으니 지운다.
RUN sed -i 's/\r$//' /usr/local/bin/api-entrypoint && chmod +x /usr/local/bin/api-entrypoint
WORKDIR /app/api
EXPOSE 3000
ENTRYPOINT ["api-entrypoint"]
CMD ["node", "--enable-source-maps", "dist/main.js"]

# ── web: Caddy + 정적 번들 ──────────────────────────────────────────────
FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
RUN sed -i 's/\r$//' /etc/caddy/Caddyfile
COPY --from=build /app/web/dist /srv

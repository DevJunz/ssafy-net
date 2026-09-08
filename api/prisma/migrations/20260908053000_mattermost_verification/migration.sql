-- Mattermost 계정 인증 (D-66).
--
-- 사내 메신저 계정 보유가 곧 SSAFY 소속 검증이다. D-20("소속 검증 없음")을 대체한다.
-- 실명(이름_캠퍼스_반)은 표시용으로 남고, 메신저에서 사람을 찾는 수단은 아이디가 된다.

ALTER TABLE "user" ADD COLUMN "mattermost_username" TEXT;
ALTER TABLE "user" ADD COLUMN "mattermost_verified_at" TIMESTAMP(3);

-- 한 Mattermost 계정은 한 사용자에만 연결된다. 남의 계정을 가로챌 수 없다.
CREATE UNIQUE INDEX "user_mattermost_username_key"
  ON "user"("mattermost_username");

-- 웹훅은 단방향이라 코드를 앱에서 다시 입력받는다.
CREATE TABLE "mattermost_verification" (
    "id"         TEXT NOT NULL,
    "user_id"    TEXT NOT NULL,
    "username"   TEXT NOT NULL,
    "code"       TEXT NOT NULL,
    "attempts"   INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at"    TIMESTAMP(3),

    CONSTRAINT "mattermost_verification_pkey" PRIMARY KEY ("id")
);

-- 발송 횟수 제한을 두 축으로 센다.
--   user_id  — 한 사람이 코드를 마구 재발송하지 못하게
--   username — 남의 아이디를 넣어 그 사람에게 코드를 뿌리지 못하게
CREATE INDEX "mattermost_verification_user_id_created_at_idx"
  ON "mattermost_verification"("user_id", "created_at");
CREATE INDEX "mattermost_verification_username_created_at_idx"
  ON "mattermost_verification"("username", "created_at");

ALTER TABLE "mattermost_verification"
  ADD CONSTRAINT "mattermost_verification_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

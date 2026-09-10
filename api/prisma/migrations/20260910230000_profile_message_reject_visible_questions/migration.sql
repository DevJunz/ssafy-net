-- 2026-09-10 사용자 피드백 묶음 (docs/16 D-83 ~ D-87).
--   - user.profile_message: 프로필 메시지. 사람 패널에서 표시명 아래에 보인다(D-85)
--   - connection_request.requester_dismissed_at: 보낸 사람이 거절됨·응답 없음·취소함 표시를 지운 시각(D-83)
--   - network_recommendation.icebreaker_ids: 성립 때 뽑아 고정한 포괄 아이스브레이킹 질문(D-87)
--   - interest_question / icebreaker_question: 네트워킹 질문. 운영자가 만들고 고치고 지운다(D-87)

-- AlterTable
ALTER TABLE "user" ADD COLUMN "profile_message" TEXT;

-- AlterTable
ALTER TABLE "connection_request" ADD COLUMN "requester_dismissed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "network_recommendation" ADD COLUMN "icebreaker_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "interest_question" (
    "id" TEXT NOT NULL,
    "interest_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interest_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icebreaker_question" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "icebreaker_question_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interest_question_interest_id_sort_order_idx" ON "interest_question"("interest_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "icebreaker_question_text_key" ON "icebreaker_question"("text");

-- CreateIndex
CREATE INDEX "icebreaker_question_active_sort_order_idx" ON "icebreaker_question"("active", "sort_order");

-- AddForeignKey
ALTER TABLE "interest_question" ADD CONSTRAINT "interest_question_interest_id_fkey" FOREIGN KEY ("interest_id") REFERENCES "interest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "DisplayNameType" AS ENUM ('NICKNAME', 'REAL');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "InterestStatus" AS ENUM ('ACTIVE', 'HIDDEN', 'MERGED');

-- CreateEnum
CREATE TYPE "InterestChangeAction" AS ENUM ('ADD', 'REMOVE');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "ConnectionRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RequestEntryPoint" AS ENUM ('SIMILAR', 'INTEREST_DETAIL', 'PROFILE', 'POST', 'GRAPH', 'NETWORK_FAILED');

-- CreateEnum
CREATE TYPE "FollowUpSubject" AS ENUM ('CONNECTION', 'NETWORK');

-- CreateEnum
CREATE TYPE "FollowUpReason" AS ENUM ('NOT_FOUND', 'NO_TIME', 'BURDEN', 'OTHER');

-- CreateEnum
CREATE TYPE "NetworkStatus" AS ENUM ('OPEN', 'ACTIVATED', 'EXPIRED', 'DISSOLVED');

-- CreateEnum
CREATE TYPE "NetworkDecision" AS ENUM ('PENDING', 'JOINED', 'DECLINED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CONNECTION_REQUEST_RECEIVED', 'CONNECTION_REQUEST_EXPIRING', 'CONNECTION_ACCEPTED', 'CONNECTION_INITIATOR_REMINDER', 'CONNECTION_COUNTERPART_REMINDER', 'CONNECTION_ASK_COUNTERPART', 'FOLLOW_UP_ASK', 'NETWORK_RECOMMENDED', 'NETWORK_EXPIRING', 'NETWORK_ACTIVATED', 'NETWORK_INITIATOR_REMINDER', 'NETWORK_MEMBER_REMINDER', 'NETWORK_FAILED', 'NETWORK_ENABLED', 'INTEREST_MERGED', 'INTEREST_HIDDEN', 'SUGGESTION_RESOLVED', 'DIGEST');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'WEB_PUSH', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('IMMEDIATE', 'DIGEST');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('USER', 'CONNECTION_REQUEST', 'POST');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "google_sub" TEXT,
    "email" TEXT,
    "real_name" TEXT,
    "campus" TEXT NOT NULL DEFAULT '서울',
    "class_no" TEXT,
    "display_name_type" "DisplayNameType" NOT NULL DEFAULT 'NICKNAME',
    "nickname" TEXT,
    "nickname_changed_at" TIMESTAMP(3),
    "status" "UserStatus" NOT NULL DEFAULT 'ONBOARDING',
    "onboarded_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "is_operator" BOOLEAN NOT NULL DEFAULT false,
    "request_suspended" BOOLEAN NOT NULL DEFAULT false,
    "suspended_reason" TEXT,
    "invited_by_code_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_code" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interest" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "InterestStatus" NOT NULL DEFAULT 'ACTIVE',
    "merged_into_id" TEXT,
    "holder_count" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_interest" (
    "user_id" TEXT NOT NULL,
    "interest_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_interest_pkey" PRIMARY KEY ("user_id","interest_id")
);

-- CreateTable
CREATE TABLE "user_interest_change" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "interest_id" TEXT NOT NULL,
    "action" "InterestChangeAction" NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_interest_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interest_suggestion" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "resolved_interest_id" TEXT,
    "operator_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "interest_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection_request" (
    "id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ConnectionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "entry_point" "RequestEntryPoint" NOT NULL,
    "common_interest_ids" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "read_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "reject_undone_at" TIMESTAMP(3),

    CONSTRAINT "connection_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection" (
    "id" TEXT NOT NULL,
    "user_a_id" TEXT NOT NULL,
    "user_b_id" TEXT NOT NULL,
    "request_id" TEXT,
    "initiator_id" TEXT NOT NULL,
    "established_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "initiator_marked_at" TIMESTAMP(3),
    "counterpart_marked_at" TIMESTAMP(3),
    "reminder_sent_at" TIMESTAMP(3),

    CONSTRAINT "connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_check" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subject_type" "FollowUpSubject" NOT NULL,
    "subject_id" TEXT NOT NULL,
    "asked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "started" BOOLEAN,
    "reason" "FollowUpReason",
    "counterpart_asked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "follow_up_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_candidate" (
    "id" TEXT NOT NULL,
    "member_set_hash" TEXT NOT NULL,
    "member_ids" TEXT[],
    "common_interest_ids" TEXT[],
    "size" INTEGER NOT NULL,
    "common_count" INTEGER NOT NULL,
    "rarity_score" DOUBLE PRECISION NOT NULL,
    "has_new_member" BOOLEAN NOT NULL DEFAULT false,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_recommendation" (
    "id" TEXT NOT NULL,
    "member_set_hash" TEXT NOT NULL,
    "common_interest_ids" TEXT[],
    "size" INTEGER NOT NULL,
    "status" "NetworkStatus" NOT NULL DEFAULT 'OPEN',
    "exposed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "activated_at" TIMESTAMP(3),
    "initiator_id" TEXT,
    "initiator_marked_at" TIMESTAMP(3),
    "reminder_sent_at" TIMESTAMP(3),

    CONSTRAINT "network_recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_member" (
    "recommendation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "decision" "NetworkDecision" NOT NULL DEFAULT 'PENDING',
    "decided_at" TIMESTAMP(3),
    "join_order" INTEGER,
    "marked_at" TIMESTAMP(3),

    CONSTRAINT "network_member_pkey" PRIMARY KEY ("recommendation_id","user_id")
);

-- CreateTable
CREATE TABLE "interest_post" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "interest_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "interest_post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "target_path" TEXT NOT NULL,
    "action_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_delivery" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "sent_at" TIMESTAMP(3),
    "clicked_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "notification_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_setting" (
    "user_id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_setting_pkey" PRIMARY KEY ("user_id","channel","category")
);

-- CreateTable
CREATE TABLE "push_subscription" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_channel" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "target_type" "ReportTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "target_owner_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolution_note" TEXT,

    CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_parameter" (
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "label" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "app_parameter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "app_parameter_change" (
    "id" BIGSERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "old_value" DOUBLE PRECISION NOT NULL,
    "new_value" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_parameter_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "job_run" (
    "id" BIGSERIAL NOT NULL,
    "job_name" TEXT NOT NULL,
    "run_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "detail" JSONB,

    CONSTRAINT "job_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_event" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "props" JSONB,
    "session_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_google_sub_key" ON "user"("google_sub");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_nickname_key" ON "user"("nickname");

-- CreateIndex
CREATE INDEX "user_status_idx" ON "user"("status");

-- CreateIndex
CREATE UNIQUE INDEX "invite_code_code_key" ON "invite_code"("code");

-- CreateIndex
CREATE UNIQUE INDEX "category_name_key" ON "category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "interest_name_key" ON "interest"("name");

-- CreateIndex
CREATE INDEX "interest_category_id_sort_order_idx" ON "interest"("category_id", "sort_order");

-- CreateIndex
CREATE INDEX "interest_status_idx" ON "interest"("status");

-- CreateIndex
CREATE INDEX "user_interest_interest_id_idx" ON "user_interest"("interest_id");

-- CreateIndex
CREATE INDEX "user_interest_change_user_id_changed_at_idx" ON "user_interest_change"("user_id", "changed_at");

-- CreateIndex
CREATE INDEX "interest_suggestion_status_created_at_idx" ON "interest_suggestion"("status", "created_at");

-- CreateIndex
CREATE INDEX "connection_request_target_id_status_created_at_idx" ON "connection_request"("target_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "connection_request_requester_id_status_created_at_idx" ON "connection_request"("requester_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "connection_request_status_expires_at_idx" ON "connection_request"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "connection_request_id_key" ON "connection"("request_id");

-- CreateIndex
CREATE INDEX "connection_user_a_id_established_at_idx" ON "connection"("user_a_id", "established_at");

-- CreateIndex
CREATE INDEX "connection_user_b_id_established_at_idx" ON "connection"("user_b_id", "established_at");

-- CreateIndex
CREATE UNIQUE INDEX "connection_user_a_id_user_b_id_key" ON "connection"("user_a_id", "user_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "follow_up_check_user_id_subject_type_subject_id_key" ON "follow_up_check"("user_id", "subject_type", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "network_candidate_member_set_hash_key" ON "network_candidate"("member_set_hash");

-- CreateIndex
CREATE INDEX "network_candidate_common_count_rarity_score_idx" ON "network_candidate"("common_count", "rarity_score");

-- CreateIndex
CREATE UNIQUE INDEX "network_recommendation_member_set_hash_key" ON "network_recommendation"("member_set_hash");

-- CreateIndex
CREATE INDEX "network_recommendation_status_expires_at_idx" ON "network_recommendation"("status", "expires_at");

-- CreateIndex
CREATE INDEX "network_member_user_id_decision_idx" ON "network_member"("user_id", "decision");

-- CreateIndex
CREATE INDEX "interest_post_interest_id_created_at_idx" ON "interest_post"("interest_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "interest_post_author_id_created_at_idx" ON "interest_post"("author_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notification_user_id_created_at_idx" ON "notification"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notification_user_id_action_required_resolved_at_idx" ON "notification"("user_id", "action_required", "resolved_at");

-- CreateIndex
CREATE INDEX "notification_delivery_notification_id_idx" ON "notification_delivery"("notification_id");

-- CreateIndex
CREATE INDEX "notification_delivery_channel_status_idx" ON "notification_delivery"("channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscription_endpoint_key" ON "push_subscription"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscription_user_id_idx" ON "push_subscription"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_channel_user_id_kind_key" ON "external_channel"("user_id", "kind");

-- CreateIndex
CREATE INDEX "report_status_created_at_idx" ON "report"("status", "created_at");

-- CreateIndex
CREATE INDEX "report_target_owner_id_created_at_idx" ON "report"("target_owner_id", "created_at");

-- CreateIndex
CREATE INDEX "app_parameter_change_key_changed_at_idx" ON "app_parameter_change"("key", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "job_run_job_name_run_key_key" ON "job_run"("job_name", "run_key");

-- CreateIndex
CREATE INDEX "analytics_event_name_occurred_at_idx" ON "analytics_event"("name", "occurred_at");

-- CreateIndex
CREATE INDEX "analytics_event_user_id_occurred_at_idx" ON "analytics_event"("user_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_invited_by_code_id_fkey" FOREIGN KEY ("invited_by_code_id") REFERENCES "invite_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interest" ADD CONSTRAINT "interest_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_interest" ADD CONSTRAINT "user_interest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_interest" ADD CONSTRAINT "user_interest_interest_id_fkey" FOREIGN KEY ("interest_id") REFERENCES "interest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_interest_change" ADD CONSTRAINT "user_interest_change_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_interest_change" ADD CONSTRAINT "user_interest_change_interest_id_fkey" FOREIGN KEY ("interest_id") REFERENCES "interest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interest_suggestion" ADD CONSTRAINT "interest_suggestion_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_request" ADD CONSTRAINT "connection_request_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_request" ADD CONSTRAINT "connection_request_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection" ADD CONSTRAINT "connection_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection" ADD CONSTRAINT "connection_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection" ADD CONSTRAINT "connection_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "connection_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_check" ADD CONSTRAINT "follow_up_check_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_member" ADD CONSTRAINT "network_member_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "network_recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_member" ADD CONSTRAINT "network_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interest_post" ADD CONSTRAINT "interest_post_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interest_post" ADD CONSTRAINT "interest_post_interest_id_fkey" FOREIGN KEY ("interest_id") REFERENCES "interest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_setting" ADD CONSTRAINT "notification_setting_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_channel" ADD CONSTRAINT "external_channel_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 관심사 목록 확정과 사용자 직접 추가 (docs/16 D-71 ~ D-74).
--   - category.kind: INTEREST(이야깃거리) / ATTRIBUTE(층처럼 분류당 하나만 고르는 속성)
--   - interest.aliases: 같은 뜻의 다른 표기. 추가 전 중복 검사 재료
--   - interest.created_by_id: 사용자가 직접 만든 관심사의 작성자
--   - 관심사 제안(S4)은 직접 추가로 대체되어 테이블과 알림 종류를 지운다

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('INTEREST', 'ATTRIBUTE');

-- AlterEnum: SUGGESTION_RESOLVED 제거. 남아 있는 행이 있으면 캐스팅이 실패하므로 먼저 지운다.
DELETE FROM "notification" WHERE "type" = 'SUGGESTION_RESOLVED';
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('CONNECTION_REQUEST_RECEIVED', 'CONNECTION_REQUEST_EXPIRING', 'CONNECTION_ACCEPTED', 'CONNECTION_INITIATOR_REMINDER', 'CONNECTION_COUNTERPART_REMINDER', 'CONNECTION_ASK_COUNTERPART', 'FOLLOW_UP_ASK', 'NETWORK_RECOMMENDED', 'NETWORK_EXPIRING', 'NETWORK_ACTIVATED', 'NETWORK_INITIATOR_REMINDER', 'NETWORK_MEMBER_REMINDER', 'NETWORK_FAILED', 'NETWORK_ENABLED', 'INTEREST_MERGED', 'INTEREST_HIDDEN', 'DIGEST');
ALTER TABLE "notification" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "public"."NotificationType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "interest_suggestion" DROP CONSTRAINT "interest_suggestion_user_id_fkey";

-- AlterTable
ALTER TABLE "category" ADD COLUMN     "kind" "CategoryKind" NOT NULL DEFAULT 'INTEREST';

-- AlterTable
ALTER TABLE "interest" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "created_by_id" TEXT;

-- DropTable
DROP TABLE "interest_suggestion";

-- DropEnum
DROP TYPE "SuggestionStatus";

-- AddForeignKey
ALTER TABLE "interest" ADD CONSTRAINT "interest_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

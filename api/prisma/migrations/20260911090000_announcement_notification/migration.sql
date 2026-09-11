-- 운영자 공지(전체 발송). 알림 종류를 하나 더한다.
-- Postgres 12+ 는 트랜잭션 안에서도 ADD VALUE 를 허용한다(같은 트랜잭션에서 쓰지만 않으면 된다).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ANNOUNCEMENT';

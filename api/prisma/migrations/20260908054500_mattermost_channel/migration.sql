-- Mattermost를 알림 채널로 추가한다 (D-66).
-- D-19가 "사내 메신저 알림 불가"를 전제로 이메일을 기본 채널로 정했는데,
-- 들어오는 웹훅으로 DM을 보낼 수 있음이 확인되어 전제가 뒤집혔다.
ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'MATTERMOST' BEFORE 'EMAIL';

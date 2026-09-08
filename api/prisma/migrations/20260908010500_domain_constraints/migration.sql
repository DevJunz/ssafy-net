-- Prisma 스키마로 표현할 수 없는 제약. 근거는 design/21 §4.4, §13.

-- 같은 방향으로 대기 중인 요청은 하나뿐이다(docs/09 §2).
-- 통유니크를 쓰지 않는 이유: 같은 쌍에 종료된 요청이 여러 번 쌓일 수 있다.
CREATE UNIQUE INDEX "uq_request_pending"
  ON "connection_request" ("requester_id", "target_id")
  WHERE "status" = 'PENDING';

-- 자기 자신에게는 요청할 수 없다. 버튼 자체가 없지만 데이터에서도 막는다.
ALTER TABLE "connection_request"
  ADD CONSTRAINT "ck_request_not_self" CHECK ("requester_id" <> "target_id");

-- 연결 쌍은 항상 정렬된 순서로 저장한다. 같은 쌍이 두 행으로 들어가는 것을
-- 유니크 제약 하나로 막기 위해서다. 방향은 initiator_id가 갖는다.
ALTER TABLE "connection"
  ADD CONSTRAINT "ck_connection_order" CHECK ("user_a_id" < "user_b_id");

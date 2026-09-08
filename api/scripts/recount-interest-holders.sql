-- interest.holder_count 재계산.
--
-- holder_count는 비정규화 값이다(design/21 §3.1). 관심사 저장 트랜잭션에서 함께
-- 갱신하지만, 데이터를 직접 손대거나 중단된 작업이 있으면 어긋날 수 있다.
-- 어긋나면 관심사 목록의 사람 수와 희소성 가중이 함께 틀어지므로 주기적으로 맞춘다.

UPDATE interest i
SET holder_count = COALESCE(c.n, 0)
FROM (
  SELECT id, (
    SELECT count(*)
    FROM user_interest ui
    JOIN "user" u ON u.id = ui.user_id
    WHERE ui.interest_id = interest.id
      AND u.status = 'ACTIVE'
  ) AS n
  FROM interest
) AS c
WHERE i.id = c.id
  AND i.holder_count IS DISTINCT FROM COALESCE(c.n, 0);

SELECT count(*) AS "관심사 수", sum(holder_count) AS "총 선택 수" FROM interest;

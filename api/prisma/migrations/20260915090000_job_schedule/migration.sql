-- 시각이 정해진 배치의 스위치와 시각 (D-96).
-- 행이 없으면 코드의 기본값을 쓴다. 그래서 이 표가 비어 있어도 동작은 지금과 같다.
CREATE TABLE "job_schedule" (
    "job_name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "hours" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "job_schedule_pkey" PRIMARY KEY ("job_name")
);

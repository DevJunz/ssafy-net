# Interest Network (ssafy_net)

관심사 그래프 기반 네트워킹 서비스. 단일 캠퍼스 약 1,000명 대상. Discover → Understand → Connect, 대화는 사내 메신저에서 실명으로.

## 현재 상태 (2026-09-08)

- **Phase 0** 프로토타입 완료: `phase0-mvp/` (Mock 데이터만, 보존용). 사용자 방향 승인됨.
- **기획(Step 1~7) 완료**: `docs/01`~`19`.
- **Phase 3 설계 완료**: `design/20`(Architecture) `21`(ERD) `22`(API). 스택은 NestJS + PostgreSQL + Prisma, 프론트는 새 `web/`(React + Vite).
- **구현 M1 완료**: 저장소 구성(`api` `web` `packages/shared`), 스키마 23모델 + 마이그레이션, 시드(관심사 100개 임시본·파라미터·초대 코드), 초대 링크 + Google OAuth + 세션, 온보딩 4단계.
- **다음: M2 발견** — 그래프 API·화면, Interest/Person 패널, Similar People, Similarity Edge. 마일스톤 전체는 `design/20 §14`.

## 작업 시작 시 읽을 것

1. `README.md` — 실행 방법, 마일스톤 상태.
2. `design/README.md` → `design/20 §14`(구현 순서) → `design/22 §16`(화면 ↔ API 매핑).
3. `docs/19_PLANNING_HANDOFF_SUMMARY.md` — 제품 규칙 진입점. Must/Should/Later, 정책 요약, User Flow.
4. `docs/16_PRODUCT_DECISION_LOG.md` — 결정의 이유. PM 의견과 다르게 결정된 3건은 재논의 대상이 아니라 측정 대상.
5. 필요할 때 원문 `docs/01`~`18`. 요약(19)과 원문이 다르면 원문 우선.

제품 규칙이 충돌하면 `docs/`가, 기술 판단이 충돌하면 `design/`이 우선한다.

## 사용자(제품 오너)가 정한 규칙

- 기획 문서에는 코드, ERD, API, 기술 스택, 아키텍처를 넣지 않는다. 이미 완료된 기획 문서를 기술 설계로 바꾸지 않는다.
- 표시명은 닉네임/실명 선택제. 연결 성립 시 실명("이름_캠퍼스_반") 무조건 공개. 소속 정보는 표시하지 않는다.
- 차단 기능 없음. 연결 해제 없음. 자체 메신저·DM·댓글·좋아요 없음.
- 사내 메신저 알림 불가. 이메일 + 브라우저 알림이 기본. Discord 등 외부 채널은 테스트 후.
- 로그인은 Google만. 가입은 초대 링크. 소속 검증 없음. 운영자 = 사용자 본인. 시드 = 같은 반 26명.
- 사용은 공개 후 약 2주에 집중. 시간 파라미터는 하루 단위(요청 만료 3일, 거절 표시 ≤1일, 재안내 1일, 후속 확인 2일).
- 연결/Network 성립 시 시작자를 지정해 "○○님이 △△님을 찾아 첫 메시지를 보내주세요"처럼 구체적으로 안내. 1:1 시작자 = 요청 보낸 사람, Network 시작자 = 가장 먼저 연결하기 버튼을 누른 사람.
- 그래프 간격·노드 크기·표시 상한 같은 세부는 문서로 확정하지 않는다. 앱을 만든 뒤 피드백으로 조정.
- Interest Post, Network 추천은 Should Have. Network 교집합 기준은 5, 게이트 미통과 시 4까지만.

## 남은 Blocking (docs/18)

- **B-1** 초기 관심사 100개 확정 — 현재 `api/prisma/seed/interests.ts`가 임시본이다. 공개 전에 사용자가 확정한 목록으로 교체한다.
- **B-3** 이메일 발송 가능 여부 테스트 (M4)
- **B-4** Discord 등 외부 채널 발송 가능 여부 테스트 (M4)

## 설계 승인 후 반영할 것

`design/20 §15`의 D-60~D-64를 `docs/16_PRODUCT_DECISION_LOG.md`에 추가한다(docs/19 §10이 지시하는 절차).

## 실행

```
npm run db:up && npm run dev:api    # http://localhost:3000/api
npm run dev:web                     # http://localhost:5173
```

자세한 준비 과정과 Google OAuth 설정은 `README.md`.

## Phase 0 프로토타입 실행 (참고용)

```
cd phase0-mvp
npm install
npm run dev
```

## 문서 작성 규칙

- 한국어. 결정에는 이유를, 숫자에는 `[P-xx]` 파라미터 표시를 붙인다.
- 새 결정은 `docs/16`에, 새 가정은 `docs/17`에, 새 질문은 `docs/18`에 추가한다.

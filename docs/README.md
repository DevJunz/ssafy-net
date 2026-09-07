# Interest Network — 기획 문서 묶음

Phase 0 프로토타입(`../phase0-mvp`)으로 방향을 검증한 뒤 작성한 Product Planning 문서다. 코드, ERD, API, 기술 스택은 포함하지 않는다. 개발 설계는 **19_PLANNING_HANDOFF_SUMMARY**에서 시작한다.

| # | 문서 | 내용 | Step |
|---|---|---|---|
| 01 | [Product Brief](01_PRODUCT_BRIEF.md) | 정의, 문제, 타깃, 가치, 가설 H1~H9 | 1 |
| 02 | [PRD](02_PRD.md) | Goals, Non-Goals, Feature, FR/NFR, Product Parameter P-01~18, Success Metrics | 2 |
| 03 | [MVP Scope](03_MVP_SCOPE.md) | Must / Should / Later, 종료 기준 | 2 |
| 04 | [User Journeys](04_USER_JOURNEYS.md) | J0 온보딩 ~ J6 재방문 | 3 |
| 05 | [Information Architecture](05_INFORMATION_ARCHITECTURE.md) | 화면 구조, 이동 경로 | 3 |
| 06 | [Screen Requirements](06_SCREEN_REQUIREMENTS.md) | 그래프 범위·허브 결정, 화면별 요구, Empty/Error 상태 | 4 |
| 07 | [Interaction Spec](07_INTERACTION_SPEC.md) | 그래프·연결·Network·알림 인터랙션 | 4 |
| 08 | [Interest Policy](08_INTEREST_POLICY.md) | 관심사 제공·선택·변경·운영 | 5 |
| 09 | [Connection Policy](09_CONNECTION_POLICY.md) | 요청·수락·거절·만료·상한 | 5 |
| 10 | [Network Recommendation Policy](10_NETWORK_RECOMMENDATION_POLICY.md) | 후보·게이트·노출 라이프사이클·참여·성립 | 5 |
| 11 | [Post Policy](11_POST_POLICY.md) | 게시글 범위와 제한 | 5 |
| 12 | [Privacy Requirements](12_PRIVACY_REQUIREMENTS.md) | 공개 범위 표, 실명·표시명 규칙 | 5 |
| 13 | [Recommendation Principles](13_RECOMMENDATION_PRINCIPLES.md) | 설명 가능성 원칙, 정렬 규칙 | 5 |
| 14 | [KPI / Analytics Plan](14_KPI_ANALYTICS_PLAN.md) | Funnel 지표, North Star, 판단 시점 | 6 |
| 15 | [Risk Register](15_RISK_REGISTER.md) | R-01~17 | 6 |
| 16 | [Product Decision Log](16_PRODUCT_DECISION_LOG.md) | D-00~59 | 6 |
| 17 | [Assumption Register](17_ASSUMPTION_REGISTER.md) | A-01~57 | 6 |
| 18 | [Open Questions](18_OPEN_QUESTIONS.md) | Blocking / Important / Later | 6 |
| 19 | [Planning Handoff Summary](19_PLANNING_HANDOFF_SUMMARY.md) | 개발 설계용 요약, Consistency Review 결과 | 7 |

## 읽는 순서

- 빠르게: 19 → 03 → 06
- 전체: 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08~13 → 14~18
- 결정의 이유를 찾을 때: 16 (Decision Log)
- 숫자의 근거를 찾을 때: 02 §8 → 각 정책 문서의 파라미터 표 → 17

## 우선순위 규칙

문서 간 내용이 다르면 번호가 큰(나중에 작성된) 문서가 우선한다. 단, 19는 요약이므로 원문(01~18)이 우선한다.

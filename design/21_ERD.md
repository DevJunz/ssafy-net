# 21. ERD / Data Model

| 항목 | 내용 |
|---|---|
| 문서 상태 | Draft v0.1 (Phase 3, ERD) |
| 작성일 | 2026-09-08 |
| 선행 문서 | 20_ARCHITECTURE |
| 다음 문서 | 22_API_SPEC |
| 대상 | PostgreSQL 16 / Prisma. 표기는 Prisma 모델, 실제 테이블명은 snake_case(`@@map`) |

이 문서는 **무엇을 저장하고 무엇을 저장하지 않는가**를 정한다. 저장하지 않기로 한 것에도 이유를 붙였다. 기획 문서가 "보여주지 않는다"고 정한 것은 대개 **애초에 계산하지 않거나 남기지 않는 것**이 가장 확실한 구현이다.

---

## 1. 전체 구조

```
                 ┌──────────┐        ┌────────────┐
                 │ Category │───1:N─►│  Interest  │◄──┐
                 └──────────┘        └────────────┘   │ mergedInto (자기참조)
                                            ▲          │
                                            │ N:M      │
                    ┌───────────────────────┴──────────┴────────────┐
                    │                 UserInterest                   │
                    └───────────────────────┬────────────────────────┘
                                            ▼
  ┌────────────┐                      ┌──────────┐
  │ InviteCode │──── 가입 경로 ─────► │   User   │◄── 모든 도메인의 중심
  └────────────┘                      └────┬─────┘
                                           │
   ┌───────────────────┬───────────────────┼────────────────────┬──────────────────┐
   ▼                   ▼                   ▼                    ▼                  ▼
┌──────────────────┐ ┌────────────┐ ┌──────────────┐ ┌──────────────────┐ ┌──────────────┐
│ConnectionRequest │ │ Connection │ │ InterestPost │ │  NetworkMember   │ │ Notification │
│  (요청·거절·만료)│ │  (성립)    │ │   (S1)       │ │        │         │ │      │       │
└────────┬─────────┘ └─────┬──────┘ └──────────────┘ └────────┼─────────┘ └──────┼───────┘
         │ 1:1 수락 시     │                                   ▼                  ▼
         └────────────────►┘                    ┌────────────────────────┐ ┌──────────────────────┐
                           │                    │ NetworkRecommendation  │ │ NotificationDelivery │
                           ▼                    │      (노출 스냅샷)     │ └──────────────────────┘
                    ┌──────────────┐            └────────────────────────┘
                    │FollowUpCheck │                        ▲
                    │  (1:1/Network 공용)                   │ 노출
                    └──────────────┘            ┌────────────────────────┐
                                                │   NetworkCandidate     │
                                                │       (후보 풀)        │
                                                └────────────────────────┘

  운영/측정 계열 (도메인과 분리):
  AppParameter · AppParameterChange · FeatureFlag · JobRun · AnalyticsEvent
  Report · InterestSuggestion · UserInterestChange
  NotificationSetting · PushSubscription · ExternalChannel
```

총 **23개 모델**. 도메인 14개, 운영·측정 9개.

---

## 2. 사용자와 신원

### 2.1 User

가장 조심해서 다뤄야 하는 테이블이다. 실명은 여기에만 있고, 나가는 통로는 세 곳뿐이다(20 §11).

```prisma
model User {
  id                String    @id @default(uuid())

  // 로그인 계정 — 다른 구성원에게 절대 보이지 않는다 (12 §1)
  googleSub         String?   @unique          // 탈퇴 시 null (재가입 허용, 12 §10)
  email             String?   @unique

  // 실명: 이름 + 반. 캠퍼스는 단일이라 고정값 (D-47, D-17)
  realName          String?                    // "최준환"
  campus            String    @default("서울")
  classNo           String?                    // "18반"
  // 전체 실명 "최준환_서울_18반"은 저장하지 않고 조합해 만든다.
  // 저장하면 세 컬럼과 어긋날 수 있고, 형식이 바뀌면 마이그레이션이 필요해진다.

  // 표시명 (12 §3)
  displayNameType   DisplayNameType @default(NICKNAME)
  nickname          String?   @unique          // 2~12자. displayNameType=REAL이면 null
  nicknameChangedAt DateTime?                  // 하루 1회 제한

  status            UserStatus @default(ONBOARDING)
  onboardedAt       DateTime?
  withdrawnAt       DateTime?

  isOperator        Boolean   @default(false)  // D-57. 일반 사용자와 같은 계정 (12 §9)
  requestSuspended  Boolean   @default(false)  // 신고 누적 시 요청 권한만 정지 (09 §9)
  suspendedReason   String?

  invitedByCodeId   String?
  createdAt         DateTime  @default(now())
  lastSeenAt        DateTime?

  @@index([status])
  @@map("user")
}

enum DisplayNameType { NICKNAME REAL }
enum UserStatus      { ONBOARDING ACTIVE WITHDRAWN }
```

| 결정 | 이유 |
|---|---|
| 전체 실명을 컬럼으로 저장하지 않는다 | 세 조각과 어긋날 여지를 없앤다. 형식은 D-47이 정하고 조합은 한 곳에서만 한다 |
| 정지는 `requestSuspended` 하나 | 정지된 사용자도 그래프에는 남는다(09 §9). 계정 잠금이 아니다 |
| 연결 수 컬럼 없음 | 남에게 보여주지 않기로 했다(12 §5). 필요하면 세면 된다. 컬럼이 있으면 언젠가 응답에 실린다 |
| `lastSeenAt` | 재방문율(14 §2.8) 계산용. 세션 길이는 재지 않는다(D-11) |

### 2.2 InviteCode

```prisma
model InviteCode {
  id        String   @id @default(uuid())
  code      String   @unique
  label     String?                       // "1차 공유용"
  active    Boolean  @default(true)
  usedCount Int      @default(0)
  createdAt DateTime @default(now())
  @@map("invite_code")
}
```

MVP에서는 링크 하나면 충분하다(FR-0.2). 테이블로 둔 이유는 유출 시(A-15) 폐기하고 새로 발급하기 위해서다. 사용 횟수 상한은 두지 않는다 — 조직 내부 공유가 전제다.

---

## 3. 관심사

### 3.1 Category / Interest / UserInterest

```prisma
model Category {
  id        String     @id @default(uuid())
  name      String     @unique
  sortOrder Int
  interests Interest[]
  @@map("category")
}

model Interest {
  id           String         @id @default(uuid())
  categoryId   String
  name         String         @unique      // 한 관심사에 하나의 이름 (08 §1)
  status       InterestStatus @default(ACTIVE)
  mergedIntoId String?                     // 병합 시 대상 (08 §5)
  holderCount  Int            @default(0)  // 비정규화. §3.2 참조
  sortOrder    Int            @default(0)
  createdAt    DateTime       @default(now())

  @@index([categoryId, sortOrder])
  @@index([status])
  @@map("interest")
}

enum InterestStatus { ACTIVE HIDDEN MERGED }

model UserInterest {
  userId     String
  interestId String
  createdAt  DateTime @default(now())

  @@id([userId, interestId])
  @@index([interestId])          // "이 관심사를 가진 사람" 조회의 핵심
  @@map("user_interest")
}
```

| 결정 | 이유 |
|---|---|
| 삭제 대신 `HIDDEN` / `MERGED` | D-37. 이미 가진 사람의 데이터를 지우지 않는다 |
| `holderCount` 비정규화 | 온보딩 화면이 관심사 100개마다 사람 수를 보여줘야 하고(06 §3.1.4), 희소성 가중이 매 추천마다 이 값을 쓴다(13 §3.2). `UserInterest` 변경 시 같은 트랜잭션에서 갱신한다 |
| 2단계 고정 (Category > Interest) | 08 §1. 3단계는 두지 않는다 |

### 3.2 UserInterestChange (변경 이력)

```prisma
model UserInterestChange {
  id         BigInt   @id @default(autoincrement())
  userId     String
  interestId String
  action     InterestChangeAction
  changedAt  DateTime @default(now())

  @@index([userId, changedAt])
  @@map("user_interest_change")
}

enum InterestChangeAction { ADD REMOVE }
```

08 §3이 "변경 빈도 제한은 없고 이력만 관찰한다"고 정했다. R-05(Interest Inflation)의 관찰 지표(1인 주 3회 이상 변경, 14 §3)가 이 테이블에서 나온다.

### 3.3 InterestSuggestion (S4)

```prisma
model InterestSuggestion {
  id                String           @id @default(uuid())
  userId            String
  name              String
  status            SuggestionStatus @default(PENDING)
  resolvedInterestId String?                        // 채택 시 생성/연결된 관심사
  operatorNote      String?                         // 반려 사유 한 줄 (08 §4)
  createdAt         DateTime         @default(now())
  resolvedAt        DateTime?

  @@index([status, createdAt])
  @@map("interest_suggestion")
}

enum SuggestionStatus { PENDING ACCEPTED REJECTED DUPLICATE }
```

---

## 4. 연결 (1:1)

이 서비스에서 가장 규칙이 많은 영역이다(09 전체). 상태 정의는 09 §11을 그대로 옮긴다.

### 4.1 ConnectionRequest

```prisma
model ConnectionRequest {
  id            String                  @id @default(uuid())
  requesterId   String
  targetId      String
  message       String                  // 필수, [P-16] 200자 (09 §2)
  status        ConnectionRequestStatus @default(PENDING)
  entryPoint    RequestEntryPoint                     // 14 §2.3 진입점 분포

  // 요청 당시의 공통 관심사를 고정한다 (08 §3)
  commonInterestIds String[]

  createdAt     DateTime  @default(now())
  expiresAt     DateTime                              // createdAt + [P-08] 3일
  readAt        DateTime?                             // 수신자 최초 열람 (14 §2.4)
  respondedAt   DateTime?                             // 수락 또는 거절 시각
  cancelledAt   DateTime?
  expiredAt     DateTime?
  rejectUndoneAt DateTime?                            // 5초 되돌리기 사용 기록

  // 같은 방향 PENDING은 하나 — Prisma로 표현할 수 없다.
  // 마이그레이션 SQL의 부분 유니크 인덱스로 만든다 (§13).
  // (requesterId, targetId, status) 통유니크는 쓰지 않는다.
  // 같은 쌍에 종료된 요청이 여러 번 쌓일 수 있기 때문이다.
  @@index([targetId, status, createdAt])
  @@index([requesterId, status, createdAt])
  @@index([status, expiresAt])                        // 만료 배치
  @@map("connection_request")
}

enum ConnectionRequestStatus { PENDING ACCEPTED REJECTED EXPIRED CANCELLED }
enum RequestEntryPoint { SIMILAR INTEREST_DETAIL PROFILE POST GRAPH NETWORK_FAILED }
```

**거절 사실은 별도 테이블에 숨기지 않는다.** `status=REJECTED`와 `respondedAt`만 있으면 되고, 보낸 사람에게 보이는 시점은 조회할 때 계산한다(20 §7):

```
보낸 사람에게 "응답 없음"으로 보이는 시각 = min(respondedAt + 24h, expiresAt)
그 전까지는 PENDING과 똑같이 보인다
```

이 계산이 09 §6("거절 비통보, 최대 하루 뒤 표시")과 06 §4("거절과 만료를 구분하지 않음")를 동시에 만족한다. **응답 DTO에 REJECTED라는 값이 보낸 사람에게 나가는 경우는 없다.**

### 4.2 Connection

```prisma
model Connection {
  id                  String   @id @default(uuid())
  userAId             String                    // 항상 userAId < userBId (문자열 정렬)
  userBId             String
  requestId           String?  @unique          // 요청 삭제 시 SetNull (탈퇴, 12 §10)
  initiatorId         String                    // 1:1 시작자 = 요청 보낸 사람 (D-15)

  establishedAt       DateTime @default(now())
  initiatorMarkedAt   DateTime?                 // "메신저에서 메시지를 보냈어요"
  counterpartMarkedAt DateTime?                 // "연락을 받았어요"
  reminderSentAt      DateTime?                 // [P-11] 재안내 1회

  @@unique([userAId, userBId])
  @@index([userAId, establishedAt])
  @@index([userBId, establishedAt])
  @@map("connection")
}
```

| 결정 | 이유 |
|---|---|
| `userAId < userBId` 정규화 | 같은 쌍이 두 행으로 들어가는 것을 유니크 제약 하나로 막는다. 방향은 `initiatorId`가 갖는다 |
| 해제 컬럼 없음 | 연결 해제는 MVP에 없다(D-42). `deletedAt`을 두면 "언젠가 쓸 것"이 되어 정책이 흐려진다 |
| 공통 관심사를 저장하지 않음 | 연결 화면의 공통 관심사는 **현재 기준으로 갱신**된다(08 §3). 저장하면 갱신 규칙과 어긋난다 |

### 4.3 FollowUpCheck (M14)

1:1과 Network가 같은 질문을 쓴다(09 §5, 10 §6). 테이블 하나로 둔다.

```prisma
model FollowUpCheck {
  id          String            @id @default(uuid())
  userId      String
  subjectType FollowUpSubject
  subjectId   String                            // connectionId 또는 recommendationId
  askedAt     DateTime          @default(now())
  respondedAt DateTime?
  started     Boolean?                          // 예/아니오
  reason      FollowUpReason?                   // "아니오"일 때만
  counterpartAsked Boolean      @default(false) // "못 찾음" → 상대에게 알림 발송 여부

  @@unique([userId, subjectType, subjectId])    // 1회만 (FR-11.6)
  @@map("follow_up_check")
}

enum FollowUpSubject { CONNECTION NETWORK }
enum FollowUpReason  { NOT_FOUND NO_TIME BURDEN OTHER }
```

유니크 제약이 "한 번만 묻는다"를 스키마 수준에서 보장한다. 배치가 두 번 돌아도 두 번 묻지 않는다.

### 4.4 요청 상태 전이와 제약

```
                    ┌──────────────────────────────────┐
   (관계 없음) ─────►│            PENDING               │
        ▲            └───┬───────┬────────┬────────┬────┘
        │  취소           │수락    │거절     │만료     │
        │                ▼       ▼        ▼        │
        │           ACCEPTED  REJECTED  EXPIRED    │
        │                │       │        │        │
        │                ▼       └───┬────┘        │
        │           Connection 생성   │ [P-07] 14일 │
        └────────────────────────────┴─────────────┘
                                (다시 요청 가능)
```

| 불변식 | 어떻게 지키는가 |
|---|---|
| 같은 방향으로 PENDING 요청은 하나 | `(requesterId, targetId, status)` 유니크. Prisma에서 부분 유니크가 안 되므로 **마이그레이션 SQL로 부분 인덱스**를 만든다: `CREATE UNIQUE INDEX ... ON connection_request (requester_id, target_id) WHERE status = 'PENDING'` |
| 양방향 동시 PENDING | 애플리케이션에서 막는다(09 §2 "상대가 나에게 보낸 요청이 대기 중이면 새 요청 불가"). 경합으로 뚫리면 수락 시 양쪽을 함께 정리하고 시작자는 먼저 보낸 쪽(07 §3.3) |
| 자기 자신에게 요청 불가 | `CHECK (requester_id <> target_id)` |
| 재요청 대기 | 마지막 종료 요청의 `respondedAt`/`expiredAt` + `[P-07]` 14일. 취소는 예외로 **다음 날부터** 가능(09 §8) |
| 횟수 상한 | 저장하지 않고 센다. KST 달력 하루 5건 / 달력 주 20건, **취소·거절 포함**(취소로 우회 못 하게, 09 §3) |
| 수락률 감속 | 저장하지 않고 센다. 취소 제외 발송 10건 이상이고 수락/발송 < 10%면 일 상한 2 |

상한과 감속을 컬럼으로 캐시하지 않는 이유: 규칙이 바뀔 예정이고(A-25, A-41), 카운터가 실제 행과 어긋나면 원인을 찾을 수 없다. 1,000명 규모에서 세는 비용은 무시할 수 있다.

---

## 5. Network (S2)

10 §2a의 핵심은 **후보 풀은 바뀌고 노출된 추천은 고정된다**이다. 테이블을 둘로 나누는 것이 이 규칙의 구현이다.

```prisma
model NetworkCandidate {                        // 후보 풀 — 언제든 갈아엎힌다
  id                String   @id @default(uuid())
  memberSetHash     String   @unique            // 정렬된 memberIds의 해시
  memberIds         String[]
  commonInterestIds String[]
  size              Int
  commonCount       Int
  rarityScore       Float                       // 정렬용. 응답에 나가지 않는다
  hasNewMember      Boolean  @default(false)    // 3일 이내 가입자 포함 (10 §2a 우선순위)
  computedAt        DateTime @default(now())

  @@index([commonCount, rarityScore])
  @@map("network_candidate")
}

model NetworkRecommendation {                   // 노출 스냅샷 — 고정된다
  id                String        @id @default(uuid())
  memberSetHash     String        @unique       // 같은 멤버 집합은 평생 한 번만 노출 (10 §7)
  commonInterestIds String[]                    // 노출 시점 고정 (10 §2a 스냅샷)
  size              Int
  status            NetworkStatus @default(OPEN)

  exposedAt         DateTime      @default(now())
  expiresAt         DateTime                    // exposedAt + [P-10] 3일
  activatedAt       DateTime?                   // [P-09] 3명째 참여 시각
  initiatorId       String?                     // 첫 참여자 (D-18). 철회 시 이관
  initiatorMarkedAt DateTime?                   // "초대했어요"
  reminderSentAt    DateTime?

  members           NetworkMember[]

  @@index([status, expiresAt])
  @@map("network_recommendation")
}

enum NetworkStatus { OPEN ACTIVATED EXPIRED DISSOLVED }

model NetworkMember {
  recommendationId String
  userId           String
  decision         NetworkDecision @default(PENDING)
  decidedAt        DateTime?
  joinOrder        Int?                          // 참여 순번. 시작자 판정과 KPI(14 §2.7)
  markedAt         DateTime?                     // "초대받았어요"

  @@id([recommendationId, userId])
  @@index([userId, decision])                    // 슬롯 계산: 내 OPEN 추천 수
  @@map("network_member")
}

enum NetworkDecision { PENDING JOINED DECLINED }
```

| 불변식 | 근거 |
|---|---|
| 같은 멤버 집합은 한 번만 노출 | `memberSetHash` 유니크 (10 §7 "거절·만료 후 재추천 없음") |
| 1인당 동시 노출 3개 | `NetworkMember` × `status=OPEN`을 세어 판단. 멤버 전원의 슬롯이 비어야 노출(10 §2a) |
| 노출된 추천에 새 멤버 편입 없음 | 멤버 행은 노출 시점에 전부 만들어지고 이후 추가되지 않는다(10 §2a) |
| 성립은 3명째 참여 즉시 | `JOINED` 개수가 `[P-09]`에 도달하면 `ACTIVATED` + `activatedAt` (D-44) |
| 시작자 이관 | 첫 참여자가 철회하면 `joinOrder`가 가장 작은 남은 `JOINED`가 시작자(10 §5) |
| 잔여 3 미만이면 조기 소멸 | `DISSOLVED` (10 §2a 탈퇴 처리) |
| "대부분 겹침" 동시 노출 금지 | 멤버 교집합이 작은 쪽 크기의 2/3 이상이면 노출 보류 (I-10 → D-62 후보) |

`rarityScore`를 후보 테이블에 저장하는 이유는 배치가 계산한 값을 노출 배치가 다시 쓰기 때문이다. **응답에는 절대 나가지 않는다**(13 원칙 2).

---

## 6. 게시글 (S1)

```prisma
model InterestPost {
  id         String    @id @default(uuid())
  authorId   String
  interestId String
  content    String                        // [P-17] 300자 (11 §2)
  createdAt  DateTime  @default(now())
  deletedAt  DateTime?                     // 작성자 또는 운영자 삭제 (11 §3)

  @@index([interestId, createdAt(sort: Desc)])
  @@index([authorId, createdAt(sort: Desc)])
  @@map("interest_post")
}
```

| 결정 | 이유 |
|---|---|
| 수정 컬럼 없음 | 수정은 없다. 삭제 후 재작성(11 §3) |
| 좋아요·댓글·조회수 테이블 없음 | D-46. 테이블이 없으면 "잠깐 붙여볼까"가 불가능해진다 |
| 관심사 제거 시 숨김을 **플래그로 두지 않음** | 조회할 때 `작성자가 그 관심사를 아직 가지고 있는가`를 조인으로 확인한다. 그래야 관심사를 다시 추가했을 때 자동 복구된다(11 §3) |
| 작성 횟수 제한(관심사당 하루 1, 전체 하루 3)은 저장하지 않음 | 센다. 요청 상한과 같은 이유 |

---

## 7. 알림

```prisma
model Notification {
  id             String           @id @default(uuid())
  userId         String
  type           NotificationType
  payload        Json                              // 표시명, 공통 관심사, 메시지 첫 줄 등
  targetPath     String                            // 도착할 화면 (FR-14.4)
  actionRequired Boolean          @default(false)  // 배지 계산 (D-31)
  createdAt      DateTime         @default(now())
  readAt         DateTime?
  resolvedAt     DateTime?                         // 대상이 처리됨 (배지에서 빠짐)

  deliveries     NotificationDelivery[]

  @@index([userId, createdAt(sort: Desc)])
  @@index([userId, actionRequired, resolvedAt])    // 배지 쿼리
  @@map("notification")
}

model NotificationDelivery {
  id             String         @id @default(uuid())
  notificationId String
  channel        NotificationChannel
  status         DeliveryStatus @default(QUEUED)
  sentAt         DateTime?
  clickedAt      DateTime?                         // /n/:id 딥링크에서 기록 (14 §2.4)
  attempts       Int            @default(0)
  error          String?

  @@index([notificationId])
  @@index([channel, status])
  @@map("notification_delivery")
}

model NotificationSetting {
  userId   String
  channel  NotificationChannel
  category NotificationCategory
  enabled  Boolean @default(true)

  @@id([userId, channel, category])
  @@map("notification_setting")
}

model PushSubscription {
  id        String   @id @default(uuid())
  userId    String
  endpoint  String   @unique
  p256dh    String
  auth      String
  createdAt DateTime @default(now())
  @@index([userId])
  @@map("push_subscription")
}

model ExternalChannel {                             // S3a — B-4 확인 후 사용
  id         String   @id @default(uuid())
  userId     String
  kind       String                                 // "discord" 등
  target     String                                 // 채널이 요구하는 식별자
  verifiedAt DateTime?
  createdAt  DateTime @default(now())
  @@unique([userId, kind])
  @@map("external_channel")
}

enum NotificationChannel  { IN_APP EMAIL WEB_PUSH EXTERNAL }
enum NotificationCategory { IMMEDIATE DIGEST }
enum DeliveryStatus       { QUEUED SENT FAILED SKIPPED }
```

### 알림 종류

| type | 카테고리 | 배지 | 도착 화면 | 근거 |
|---|---|---|---|---|
| `CONNECTION_REQUEST_RECEIVED` | 즉시 | ○ | 요청 상세 | FR-14.2 |
| `CONNECTION_REQUEST_EXPIRING` | 즉시 | ○ | 요청 상세 | 09 §4 |
| `CONNECTION_ACCEPTED` | 즉시 | ○ | 연결 성립 | 09 §5 |
| `CONNECTION_INITIATOR_REMINDER` | 즉시 | — | 연결 성립 | P-11 |
| `CONNECTION_COUNTERPART_REMINDER` | 즉시 | — | 연결 성립 | FR-11.5 |
| `CONNECTION_ASK_COUNTERPART` | 즉시 | — | 연결 성립 | 후속확인 "못 찾음" |
| `FOLLOW_UP_ASK` | 즉시 | ○ | 후속 확인 | M14 |
| `NETWORK_RECOMMENDED` | 즉시 | — | Network 상세 | 10 §2a |
| `NETWORK_EXPIRING` | 즉시 | — | Network 상세 | 10 §5 |
| `NETWORK_ACTIVATED` | 즉시 | ○ | Network 성립 | 10 §6 |
| `NETWORK_INITIATOR_REMINDER` | 즉시 | — | Network 성립 | 10 §6 |
| `NETWORK_MEMBER_REMINDER` | 즉시 | — | Network 성립 | 10 §6 |
| `NETWORK_FAILED` | 즉시 | — | Networks | 10 §6 |
| `NETWORK_ENABLED` | 즉시 | — | Networks | 10 §4 게이트 통과 |
| `INTEREST_MERGED` / `INTEREST_HIDDEN` | 즉시 | — | 관심사 수정 | 08 §5 |
| `SUGGESTION_RESOLVED` | 즉시 | — | 관심사 수정 | 08 §4 |
| `DIGEST` | 묶음 | — | Similar 또는 관심사 상세 | S3, P-12 |

**배지 = 처리가 필요한 것의 수**(D-31): `actionRequired = true AND resolvedAt IS NULL`인 알림 수. 단순 미읽음 수가 아니다. 요청을 수락하면 그 알림의 `resolvedAt`이 채워지고 배지가 줄어든다.

---

## 8. 신고

```prisma
model Report {
  id             String           @id @default(uuid())
  reporterId     String
  targetType     ReportTargetType
  targetId       String
  targetOwnerId  String                           // 누적 신고 판단용 (09 §3)
  reason         String
  detail         String?
  status         ReportStatus     @default(OPEN)
  createdAt      DateTime         @default(now())
  resolvedAt     DateTime?
  resolutionNote String?

  @@index([status, createdAt])
  @@index([targetOwnerId, createdAt])             // "동일인 반복 신고" (R-15)
  @@map("report")
}

enum ReportTargetType { USER CONNECTION_REQUEST POST }
enum ReportStatus     { OPEN RESOLVED DISMISSED }
```

차단 테이블은 **없다**(D-48). 신고자에게 결과를 통보하지 않으므로 통보 관련 컬럼도 없다(09 §9).

---

## 9. 운영과 측정

```prisma
model AppParameter {                              // 20 §9
  key       String   @id                          // "P-03"
  value     Float
  label     String                                // "Similar People 공통 관심사 기준"
  updatedAt DateTime @updatedAt
  updatedBy String?
  @@map("app_parameter")
}

model AppParameterChange {
  id        BigInt   @id @default(autoincrement())
  key       String
  oldValue  Float
  newValue  Float
  reason    String?
  changedAt DateTime @default(now())
  @@index([key, changedAt])
  @@map("app_parameter_change")
}

model FeatureFlag {
  key       String   @id                          // "network_enabled"
  enabled   Boolean  @default(false)
  note      String?
  updatedAt DateTime @updatedAt
  @@map("feature_flag")
}

model JobRun {                                    // 배치 멱등성 (20 §7)
  id         BigInt    @id @default(autoincrement())
  jobName    String
  runKey     String                               // 예: "network.expose:2026-09-08T09"
  status     String                               // running / done / failed
  startedAt  DateTime  @default(now())
  finishedAt DateTime?
  detail     Json?

  @@unique([jobName, runKey])
  @@map("job_run")
}

model AnalyticsEvent {                            // 14 §6
  id         BigInt   @id @default(autoincrement())
  userId     String?
  name       String
  props      Json?
  sessionId  String?
  occurredAt DateTime @default(now())

  @@index([name, occurredAt])
  @@index([userId, occurredAt])
  @@map("analytics_event")
}
```

**이벤트에 파라미터 값을 복사해 넣지 않는다.** `AppParameterChange`가 시각별 값의 타임라인을 갖고 있으므로 `occurredAt`으로 조인하면 그 시점의 값을 알 수 있다(14 §1 요구를 만족). 이벤트마다 파라미터 18개를 복사하면 저장량만 늘고 값이 어긋날 여지가 생긴다.

---

## 10. 저장하지 않기로 한 것

| 저장하지 않음 | 이유 |
|---|---|
| 세션 테이블 | 쿠키 JWT + 매 요청 사용자 조회(20 §5.2) |
| 차단 목록 | 차단 기능이 없다(D-48) |
| 연결 해제 이력 | 해제가 없다(D-42) |
| 사용자별 연결 수 | 남에게 보여주지 않는다(12 §5). 컬럼이 있으면 언젠가 응답에 실린다 |
| 좋아요·댓글·조회수 | D-46 |
| Similar People 결과 | 매번 계산한다. 관심사 변경 시 즉시 반영이 요구다(NFR-5) |
| 그래프 레이아웃(노드 위치) | 배치 저장 기능은 없다(07 §2.15) |
| 추천 점수·유사도 | 응답에 나가지 않는 값이므로 사용자 대상 테이블에 남길 이유가 없다(13 원칙 2). 정렬용 `rarityScore`만 후보 풀 내부에 둔다 |
| 표시명 변경 이력 | 상대에게 보이지 않는다(12 §3) |
| 요청 메시지 원문의 별도 사본 | `ConnectionRequest.message` 하나. 탈퇴 시 함께 지운다(12 §10) |

---

## 11. 탈퇴 처리 (12 §10)

탈퇴는 행 삭제가 아니라 **개인 데이터 제거 + 흔적 유지**다. 트랜잭션 하나로 처리한다.

| 대상 | 처리 |
|---|---|
| `User` | `status=WITHDRAWN`, `withdrawnAt` 기록. `googleSub`·`email`·`realName`·`classNo`·`nickname` → null (재가입 허용, 유니크 해제) |
| `UserInterest`, `UserInterestChange` | 삭제 |
| `InterestPost` | 삭제 |
| `ConnectionRequest` (보낸 것·받은 것) | 삭제 (받은 요청 메시지도 지운다) |
| `Connection` | **유지.** `requestId`는 SetNull. 상대에게는 "탈퇴한 사용자"로 보이고 실명은 나가지 않는다 (I-13 → D-64 후보) |
| `NetworkMember` | 삭제. 남은 인원이 `[P-09]` 미만인 OPEN 추천은 `DISSOLVED` |
| `Report`(내가 한 것), `Notification`, `NotificationSetting`, `PushSubscription`, `ExternalChannel`, `FollowUpCheck` | 삭제 |
| `AnalyticsEvent` | `userId` → null (집계는 남는다, 12 §10) |

---

## 12. 시드 데이터

| 대상 | 내용 | 시점 |
|---|---|---|
| `Category` + `Interest` | 08 §1의 Category 8개 초안으로 개발 진행. **최종 100개는 B-1로 사용자가 구현 시작 전 확정** | M1 |
| `AppParameter` | P-01~P-18 초기값 (02 §8) | M1 |
| `FeatureFlag` | `network_enabled = false` (게이트 통과 전, 10 §4) | M1 |
| `InviteCode` | 초대 링크 1개 | M1 |
| 개발용 더미 사용자 | 로컬 전용. 관심사 분포를 실제와 비슷하게(인기 관심사 30% 편중 포함) 만들어 R-04를 미리 본다 | M2 |

`AppParameter` 초기값:

```
P-01 5   P-02 15   P-03 3    P-04 5    P-05a 3  P-05b 6
P-06d 5  P-06w 20  P-07 14   P-08 3    P-08a 1  P-09 3
P-10 3   P-11 1    P-12 1    P-13 30   P-14 8   P-15 10
P-16 200 P-17 300  P-18 2
```

---

## 13. 마이그레이션

**초기 마이그레이션에 전체 스키마를 한 번에 넣는다.** 마일스톤별로 쪼개려 했으나
신규 프로젝트라 나눌 이득이 없고(운영 중인 DB가 아니다), 나중에 스키마를 뒤집는
비용이 지금 다 정의하는 비용보다 크다(design/20 §14).

| 마이그레이션 | 내용 |
|---|---|
| `..._init` | 모델 23개 전부 |
| `..._domain_constraints` | Prisma로 표현할 수 없는 제약(아래) |

Prisma가 만들지 못하는 것은 마이그레이션 SQL로 직접 넣는다.

```sql
-- 같은 방향 PENDING 요청은 하나
CREATE UNIQUE INDEX uq_request_pending
  ON connection_request (requester_id, target_id)
  WHERE status = 'PENDING';

-- 자기 자신에게 요청 불가
ALTER TABLE connection_request
  ADD CONSTRAINT ck_request_not_self CHECK (requester_id <> target_id);

-- 연결 쌍 정규화
ALTER TABLE connection
  ADD CONSTRAINT ck_connection_order CHECK (user_a_id < user_b_id);
```

---

## 14. 남은 결정

| 항목 | 언제 |
|---|---|
| 관심사 100개 확정 후 시드 교체 (B-1) | 구현 시작 전, 사용자 |
| `ExternalChannel.target`의 실제 형태 (B-4 결과에 따름) | 구현 중 |
| `holderCount` 비정규화를 트리거로 할지 애플리케이션에서 할지 | 구현 단계. 기본은 애플리케이션(같은 트랜잭션) |
| `AnalyticsEvent` 보존 기간 | MVP 종료 시 판단(12 §10) |

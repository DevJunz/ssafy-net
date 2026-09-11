/**
 * 운영자 대시보드 (`GET /api/admin/ops`, 화면 `/ops`). D-77.
 *
 * 두 블록이다. `product` 는 PM 이 매일 보는 것(docs/14 §4·§5), `server` 는 서버가 조용히 죽는 곳(design/23).
 * 비율은 분모가 0이면 `null`. 날짜 문자열은 KST 기준 `YYYY-MM-DD`.
 * 사용자는 표시명과 id 만 나간다. 실명은 이 응답에 없다(design/20 §11).
 */

export type OpsDay = string;

export interface OpsDayCount {
  day: OpsDay;
  count: number;
}

export interface OpsRequestDay {
  day: OpsDay;
  sent: number;
  accepted: number;
  rejected: number;
  expired: number;
  cancelled: number;
}

export type OpsRequestEntry =
  | 'SIMILAR'
  | 'INTEREST_DETAIL'
  | 'PROFILE'
  | 'POST'
  | 'GRAPH'
  | 'NETWORK_FAILED';

export interface OpsEntryStat {
  entry: OpsRequestEntry;
  sent: number;
  accepted: number;
  /** accepted / (accepted + rejected + expired). 응답이 하나도 없으면 null */
  acceptRate: number | null;
  /** 이 길의 열람 수(서버가 본 것). 길에 따라 없을 수 있다 */
  views: number | null;
  /** sent / views */
  conversion: number | null;
}

export interface OpsCommonBucket {
  bucket: '0' | '1-2' | '3-4' | '5+';
  sent: number;
  accepted: number;
}

export interface OpsUserRef {
  id: string;
  displayName: string;
}

export interface OpsCreatedInterest {
  id: string;
  name: string;
  category: string;
  createdAt: string;
  creator: OpsUserRef | null;
  holderCount: number;
  /** 만든 사람을 뺀 보유자 수. 0이면 개인 라벨(병합·숨김 후보), 2 이상이면 목록의 빈틈 */
  others: number;
  status: 'ACTIVE' | 'HIDDEN' | 'MERGED';
}

export interface OpsJob {
  name: string;
  /** 사람이 읽는 주기. 예 "10분", "매시", "09:00·18:00" */
  schedule: string;
  /** 이 시간을 넘게 성공이 없으면 늦은 것 */
  staleAfterHours: number;
  lastStatus: 'done' | 'failed' | 'running' | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  /** 마지막 성공 뒤 지난 시간. 성공이 한 번도 없으면 null */
  hoursSinceSuccess: number | null;
  stale: boolean;
}

export interface OpsMetrics {
  generatedAt: string;
  /** 집계 창(일). 오늘을 포함한다 */
  days: number;

  product: {
    /** North Star: 신규 성립 연결 수. 1:1 = 1, Network 성립 = 참여 인원 (docs/14 §4) */
    northStar: {
      byDay: OpsDayCount[];
      windowTotal: number;
      today: number;
      yesterday: number;
      allTime: number;
    };

    requests: {
      byDay: OpsRequestDay[];
      totals: {
        sent: number;
        accepted: number;
        rejected: number;
        expired: number;
        cancelled: number;
        pending: number;
      };
      acceptRate: number | null;
      byEntry: OpsEntryStat[];
      byCommonCount: OpsCommonBucket[];
      /** 오늘 한 사람이 가장 많이 보낸 요청 수. 횟수 상한이 없어(D-82) 이것으로 남용을 본다 */
      maxSentToday: number;
    };

    /** 가드레일: 후속 확인 "대화 시작" 응답 비율 ≥ 50% (docs/14 §4) */
    guardrail: {
      asked: number;
      responded: number;
      started: number;
      startedRate: number | null;
      responseRate: number | null;
    };

    onboarding: {
      /** 가입(사용자 행 생성) → Mattermost 인증 → 완료(ACTIVE) */
      signedUp: number;
      verified: number;
      completed: number;
      withdrawn: number;
      stuck: number;
      verificationsSent: number;
      verificationsUsed: number;
      byDay: { day: OpsDay; signedUp: number; completed: number }[];
      /** 실명 대신 닉네임을 고른 비율 */
      nicknameRate: number | null;
    };

    interests: {
      totalActive: number;
      userCreated: number;
      hidden: number;
      merged: number;
      /** 사용자가 직접 만든 관심사. 최근 것부터 */
      created: OpsCreatedInterest[];
      /** 사용자가 만든 것 중 분류별 개수 */
      createdByCategory: { category: string; count: number }[];
      topByHolders: { id: string; name: string; holderCount: number }[];
      /** 집계 창 안의 관심사 변경 */
      changes: { added: number; removed: number; users: number };
      /** 오늘 직접 추가 상한(하루 3개)에 닿은 사용자 수 */
      createCapReachedToday: number;
    };

    /** 무엇을 보는가(서버가 기록한 열람)와 무엇을 누르는가(프론트가 보낸 클릭) */
    exploration: {
      views: {
        graphMe: number;
        graphInterest: number;
        /** 관심사 둘 이상 교집합(D-76) */
        graphMulti: number;
        similar: number;
        profile: number;
        interestDetail: number;
        interestPeople: number;
      };
      byDay: { day: OpsDay; graph: number; similar: number; profile: number }[];
      clicks: {
        interest: number;
        person: number;
        anchorChange: number;
        background: number;
        similarOff: number;
      };
      /** 앵커로 가장 많이 쓰인 관심사 */
      topAnchors: { id: string; name: string; count: number }[];
      /** 프로필을 연 사람 수 / 완료자 수 */
      profileViewerRate: number | null;
      /** 요청을 보낸 사람 수 / 프로필을 연 사람 수 */
      requesterRate: number | null;
    };

    activity: {
      /** KST 시각별 홈 진입(그래프 열람) 수. 길이 24 */
      hourOfDay: number[];
      /** 월(0)~일(6) */
      weekday: number[];
      dau: OpsDayCount[];
      activeToday: number;
      wau: number;
      /** 온보딩 완료 8일 이상 지난 사람 중 8~14일차에 다시 온 비율 */
      week2Return: { eligible: number; returned: number; rate: number | null };
      /** 이벤트 기록이 시작된 시각. 그 전의 활동은 여기 없다 */
      trackingSince: string | null;
    };

    notifications: {
      byType: {
        type: string;
        sent: number;
        clicked: number;
        clickRate: number | null;
      }[];
      /** 묶음 알림(DIGEST) 발송·클릭 */
      digest: { sent: number; clicked: number; clickRate: number | null };
    };

    network: {
      enabled: boolean;
      /** 게이트 판정(docs/10 §4). 참고값이다 — 켜는 시점은 운영자가 화면에서 정한다(D-78) */
      gate: { activeUsers: number; perUser: number; passes: boolean };
      candidates: number;
      open: number;
      activated: number;
      expired: number;
      dissolved: number;
      joined: number;
      declined: number;
    };
  };

  server: {
    process: {
      startedAt: string;
      uptimeSec: number;
      nodeVersion: string;
      rssMb: number;
      heapUsedMb: number;
    };
    host: {
      totalMemMb: number;
      freeMemMb: number;
      loadAvg: number[];
      cpus: number;
    };
    db: {
      sizeMb: number;
      connections: number;
      /** 큰 표부터. 추정 행 수(pg_stat) */
      tables: { name: string; rows: number; sizeMb: number }[];
      events: number;
    };
    /** 프로세스 시작 뒤 메모리 안에서 센 것. 재시작하면 0 부터 */
    http: {
      since: string;
      total: number;
      status4xx: number;
      status5xx: number;
      /** 1초 넘은 요청 */
      slow: number;
      avgMs: number | null;
      p95Ms: number | null;
      /** 최근 24시간, 시각별 */
      hourly: { hour: string; total: number; status5xx: number; slow: number }[];
      recentErrors: { at: string; method: string; path: string; status: number; ms: number }[];
      /** 초대 코드 조회 404. 폭주하면 무작위 대입 */
      invite404: number;
      unauthenticated: number;
    };
    webhook: {
      since: string;
      ok: number;
      failed: number;
      byError: { error: string; count: number }[];
      avgMs: number | null;
      p95Ms: number | null;
      recent: { at: string; ok: boolean; error: string | null; ms: number }[];
    };
    deliveries: {
      last24h: { queued: number; sent: number; failed: number; skipped: number };
      /** 30분 넘게 QUEUED. 프로세스가 죽어 발송을 잃은 것 */
      stuckQueued: number;
      recentFailures: { at: string; type: string; error: string | null }[];
      byDay: { day: OpsDay; sent: number; failed: number }[];
    };
    jobs: OpsJob[];
    backups: {
      /** 컨테이너에 백업 폴더가 마운트돼 있는가 */
      available: boolean;
      last: { file: string; sizeMb: number; at: string } | null;
      count: number;
      diskFreeMb: number | null;
      diskTotalMb: number | null;
    };
    abuse: {
      suspended: number;
      /** 오늘 한 사람이 가장 많이 보낸 요청 수 (requests.maxSentToday 와 같다) */
      maxSentToday: number;
      /** P-20 건 이상 보냈는데 수락률이 P-21% 미만인 사용자. 자동 감속은 없다(D-82) */
      lowAcceptRate: number;
    };
    mode: {
      nodeEnv: string;
      deliveryMode: string;
      allowListSize: number;
    };
  };
}

/** `POST /api/events` 본문 (design/22 §14). */
export interface TrackEventsInput {
  events: {
    name: string;
    props?: Record<string, unknown>;
    occurredAt?: string;
  }[];
  sessionId?: string;
}

/** `PUT /api/admin/ops/network` 응답 (D-78). 켤 때만 후보·노출·안내 수가 있고, 끌 때는 0 이다. */
export interface OpsNetworkSwitchResult {
  enabled: boolean;
  candidates: number;
  exposed: number;
  /** 처음 켤 때 "네트워크 추천이 시작되었습니다" 를 보낸 대상 수. 사용자당 한 번이다 */
  notified: number;
}

/** 운영자 한 명 (`GET /api/admin/ops/operators`, D-79). 이메일은 로그인 계정을 가리키는 용도로 운영자끼리만 본다. 실명은 없다. */
export interface OpsOperator {
  id: string;
  displayName: string;
  email: string | null;
  /** 호출한 본인. 자기 자신은 해제할 수 없다 */
  self: boolean;
}


/** 운영자 공지 한 건 (`GET /api/admin/ops/announcements`). */
export interface OpsAnnouncement {
  id: string;
  title: string | null;
  body: string;
  /** 보낸 때(ISO) */
  sentAt: string;
  /** 알림함에 받은 사람 수 */
  recipients: number;
  /** 메신저 DM 을 실제로 보낸 수(끈 사람과 아이디 없는 사람은 빠진다) */
  messenger: number;
}

/** `POST /api/admin/ops/announce` 응답. */
export interface OpsAnnounceResult {
  id: string;
  recipients: number;
  /** 메신저 DM 대기열에 올라간 수 */
  messenger: number;
  /** 즉시 알림을 꺼 둬서 앱에만 남는 사람 수 */
  appOnly: number;
}

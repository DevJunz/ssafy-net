/**
 * Product Parameter (docs/02 §8).
 *
 * 값은 DB(app_parameter)가 갖는다. 여기 있는 것은 키·라벨·초기값뿐이다.
 * 코드에 상수로 박지 않는 이유는 design/20 §9를 참조한다.
 * 공개 3일째 P-03을 낮추는 판단(docs/13 §3.3)이 이미 예정되어 있다.
 *
 * 연결 요청 상한(P-06d·P-06w)과 감속 상한(P-22)은 D-82 로, 거절 후 재요청 대기(P-07)와
 * "응답 없음" 표시 지연(P-08a)은 D-83 으로 없어졌다. DB 에 옛 행이 남아 있어도 무시된다.
 */
export const PARAMETER_DEFS = {
  'P-01': { label: '관심사 최소 선택 수', value: 5 },
  'P-02': { label: '관심사 최대 선택 수', value: 15 },
  'P-03': { label: 'Similar People 공통 관심사 기준', value: 3 },
  'P-04': { label: 'Network 전원 공통 관심사 기준', value: 5 },
  'P-05a': { label: 'Network 그룹 최소 크기', value: 3 },
  'P-05b': { label: 'Network 그룹 최대 크기', value: 6 },
  'P-08': { label: '요청 만료(일)', value: 3 },
  'P-09': { label: 'Network 최소 참여 인원', value: 3 },
  'P-10': { label: 'Network 추천 만료(일)', value: 3 },
  'P-11': { label: '시작자 미행동 시 재안내까지(일)', value: 1 },
  'P-12': { label: '묶음 알림 주기(일)', value: 1 },
  'P-13': { label: '그래프 사람 표시 상한', value: 30 },
  'P-14': { label: '인접 관심사 표시 상한', value: 8 },
  'P-15': { label: 'Similar 모드 선 상한', value: 10 },
  'P-16': { label: '요청 메시지 길이 상한', value: 200 },
  'P-17': { label: '글 길이 상한', value: 300 },
  'P-18': { label: '후속 확인 시점(성립 후 일)', value: 2 },
  'P-19': { label: 'Network 1인당 동시 노출 슬롯', value: 3 },
  'P-20': { label: '낮은 수락률 신호 — 최소 발송 건수', value: 10 },
  'P-21': { label: '낮은 수락률 신호 — 임계(%)', value: 10 },
} as const;

export type ParameterKey = keyof typeof PARAMETER_DEFS;

export type ParameterMap = Record<ParameterKey, number>;

export const PARAMETER_KEYS = Object.keys(PARAMETER_DEFS) as ParameterKey[];

export const DEFAULT_PARAMETERS: ParameterMap = Object.fromEntries(
  PARAMETER_KEYS.map((key) => [key, PARAMETER_DEFS[key].value]),
) as ParameterMap;

/** design/20 §9. 둘 다 운영자 화면(/ops)에서 켜고 끈다. */
export const FEATURE_FLAGS = {
  network_enabled: {
    label: 'Network 추천 노출',
    enabled: false,
    note: '공개 3일째 게이트 판정 후 운영자가 켠다 (docs/10 §4)',
  },
  /**
   * 초대 링크 없이는 가입할 수 없게 한다(FR-0.2). 기본은 꺼짐 — SSAFY 만 대상이라 Mattermost 인증(D-66)이
   * 소속 검증을 겸하므로 초대 링크가 필요 없다(D-84). 켜면 옛 규칙대로 초대 링크를 연 사람만 가입한다.
   */
  invite_required: {
    label: '가입에 초대 링크 필요',
    enabled: false,
    note: '꺼져 있으면 누구나 Google 로 바로 가입한다. Mattermost 인증이 소속 검증이다(D-84)',
  },
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;
export type FeatureFlagMap = Record<FeatureFlagKey, boolean>;

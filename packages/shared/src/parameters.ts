/**
 * Product Parameter (docs/02 §8).
 *
 * 값은 DB(app_parameter)가 갖는다. 여기 있는 것은 키·라벨·초기값뿐이다.
 * 코드에 상수로 박지 않는 이유는 design/20 §9를 참조한다.
 * 공개 3일째 P-03을 낮추는 판단(docs/13 §3.3)이 이미 예정되어 있다.
 */
export const PARAMETER_DEFS = {
  'P-01': { label: '관심사 최소 선택 수', value: 5 },
  'P-02': { label: '관심사 최대 선택 수', value: 15 },
  'P-03': { label: 'Similar People 공통 관심사 기준', value: 3 },
  'P-04': { label: 'Network 전원 공통 관심사 기준', value: 5 },
  'P-05a': { label: 'Network 그룹 최소 크기', value: 3 },
  'P-05b': { label: 'Network 그룹 최대 크기', value: 6 },
  'P-06d': { label: '연결 요청 일일 상한', value: 5 },
  'P-06w': { label: '연결 요청 주간 상한', value: 20 },
  'P-07': { label: '거절 후 재요청 대기(일)', value: 14 },
  'P-08': { label: '요청 만료(일)', value: 3 },
  'P-08a': { label: '거절 후 "응답 없음" 표시까지(일)', value: 1 },
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
  'P-20': { label: '수락률 감속 판정 최소 발송 건수', value: 10 },
  'P-21': { label: '수락률 감속 임계(%)', value: 10 },
  'P-22': { label: '수락률 감속 시 일일 상한', value: 2 },
} as const;

export type ParameterKey = keyof typeof PARAMETER_DEFS;

export type ParameterMap = Record<ParameterKey, number>;

export const PARAMETER_KEYS = Object.keys(PARAMETER_DEFS) as ParameterKey[];

export const DEFAULT_PARAMETERS: ParameterMap = Object.fromEntries(
  PARAMETER_KEYS.map((key) => [key, PARAMETER_DEFS[key].value]),
) as ParameterMap;

/** design/20 §9. 지금 필요한 것은 network_enabled 하나다(docs/10 §4 데이터 게이트). */
export const FEATURE_FLAGS = {
  network_enabled: {
    label: 'Network 추천 노출',
    enabled: false,
    note: '공개 3일째 게이트 판정 후 운영자가 켠다 (docs/10 §4)',
  },
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;
export type FeatureFlagMap = Record<FeatureFlagKey, boolean>;

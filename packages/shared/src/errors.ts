/**
 * 오류 코드와 화면 문구 (design/22 §1.2).
 *
 * message는 화면에 그대로 쓸 수 있는 한국어다(docs/06 §4의 문구).
 * 프론트가 코드별로 문구를 다시 만들면 문구가 갈라진다.
 */
export const ERROR_MESSAGES = {
  UNAUTHENTICATED: '로그인이 필요합니다.',
  INVITE_REQUIRED: '초대 링크가 필요합니다.',
  INVITE_INVALID: '유효하지 않은 초대 링크입니다.',
  ONBOARDING_REQUIRED: '관심사 선택을 마쳐야 이용할 수 있습니다.',
  FORBIDDEN: '권한이 없습니다.',
  NOT_FOUND: '대상을 찾을 수 없습니다.',

  REQUEST_SUSPENDED: '요청 권한이 정지되어 있습니다.',
  INTEREST_COUNT_MIN: '관심사를 더 골라주세요.',
  INTEREST_COUNT_MAX: '고를 수 있는 관심사 개수를 넘었습니다.',
  INTEREST_ATTRIBUTE_SINGLE: '이 항목은 하나만 고를 수 있습니다.',
  INTEREST_EXISTS: '같은 관심사가 이미 있습니다. 목록에서 골라주세요.',
  INTEREST_SIMILAR: '비슷한 관심사가 이미 있습니다.',
  INTEREST_CREATE_LIMIT: '오늘 추가할 수 있는 관심사를 모두 만들었습니다.',
  INTEREST_CATEGORY_INVALID: '이 분류에는 관심사를 추가할 수 없습니다.',
  NICKNAME_TAKEN: '이미 사용 중인 닉네임입니다.',
  NICKNAME_LOOKS_LIKE_REAL_NAME:
    '다른 구성원의 실명과 비슷한 닉네임은 쓸 수 없습니다.',
  NICKNAME_INVALID: '사용할 수 없는 닉네임입니다.',
  NICKNAME_CHANGE_TOO_SOON: '표시명은 하루에 한 번 바꿀 수 있습니다.',

  REQUEST_LIMIT_REACHED:
    '오늘 보낼 수 있는 요청을 모두 사용했습니다. 내일 다시 보낼 수 있습니다.',
  REQUEST_ALREADY_EXISTS: '이미 보낸 요청이 있습니다.',
  REQUEST_INCOMING_EXISTS:
    '이 사람이 먼저 요청했습니다. 수락 또는 거절로 응답해주세요.',
  REQUEST_COOLDOWN: '아직 다시 요청할 수 없습니다.',
  ALREADY_CONNECTED: '이미 연결된 사람입니다.',
  ALREADY_HANDLED: '이미 처리된 항목입니다.',
  UNDO_WINDOW_PASSED: '되돌릴 수 있는 시간이 지났습니다.',

  POST_LIMIT_REACHED: '오늘 이 관심사에 남길 수 있는 글을 모두 썼습니다.',
  POST_INTEREST_NOT_OWNED:
    '이 관심사를 추가하면 글을 남길 수 있습니다.',

  NETWORK_SLOT_FULL: '결정하면 다른 추천을 볼 수 있습니다.',
  NETWORK_DISABLED: '아직 네트워크 추천이 시작되지 않았습니다.',

  NOTIFICATION_CHANNEL_REQUIRED:
    '받은 요청 알림은 최소 한 곳에서는 켜져 있어야 합니다. 요청을 놓칠 수 있습니다.',

  VALIDATION_FAILED: '입력을 다시 확인해주세요.',
  INTERNAL: '문제가 생겼습니다. 잠시 후 다시 시도해주세요.',
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

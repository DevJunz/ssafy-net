import { HttpException } from '@nestjs/common';
import { ERROR_MESSAGES, type ErrorCode } from '@ssafy-net/shared';

/**
 * 오류 코드마다 HTTP 상태와 화면 문구가 정해져 있다(design/22 §1.2).
 * 문구를 프론트가 다시 만들지 않도록 서버가 한국어 message를 함께 보낸다.
 */
const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  INVITE_REQUIRED: 403,
  INVITE_INVALID: 400,
  ONBOARDING_REQUIRED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,

  REQUEST_SUSPENDED: 403,
  INTEREST_COUNT_MIN: 400,
  INTEREST_COUNT_MAX: 400,
  INTEREST_ATTRIBUTE_SINGLE: 400,
  INTEREST_EXISTS: 409,
  INTEREST_SIMILAR: 409,
  INTEREST_CREATE_LIMIT: 429,
  INTEREST_CATEGORY_INVALID: 400,
  NICKNAME_TAKEN: 400,
  NICKNAME_LOOKS_LIKE_REAL_NAME: 400,
  NICKNAME_INVALID: 400,
  NICKNAME_CHANGE_TOO_SOON: 400,

  REQUEST_LIMIT_REACHED: 429,
  REQUEST_ALREADY_EXISTS: 409,
  REQUEST_INCOMING_EXISTS: 409,
  REQUEST_COOLDOWN: 409,
  ALREADY_CONNECTED: 409,
  ALREADY_HANDLED: 409,
  UNDO_WINDOW_PASSED: 409,

  POST_LIMIT_REACHED: 429,
  POST_INTEREST_NOT_OWNED: 403,

  NETWORK_SLOT_FULL: 409,
  NETWORK_DISABLED: 404,

  NOTIFICATION_CHANNEL_REQUIRED: 400,

  VALIDATION_FAILED: 400,
  MATTERMOST_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class AppError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    readonly details?: Record<string, unknown>,
    message?: string,
  ) {
    super(
      {
        code,
        message: message ?? ERROR_MESSAGES[code],
        ...(details ? { details } : {}),
      },
      STATUS[code],
    );
  }
}

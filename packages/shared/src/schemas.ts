import { z } from 'zod';

/**
 * 요청 본문 검증 규칙. 서버(파이프)와 프론트(폼)가 같은 스키마를 쓴다.
 * 길이 상한처럼 파라미터에 묶인 값은 여기서 최대치를 두고,
 * 실제 상한은 서버가 DB의 파라미터로 다시 확인한다(design/20 §9).
 */

export const identitySchema = z.object({
  realName: z.string().trim().min(1, '이름을 입력해주세요.').max(20),
  classNo: z.string().trim().min(1, '반을 입력해주세요.').max(10),
});
export type IdentityInput = z.infer<typeof identitySchema>;

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 12;

/**
 * Mattermost 인증 (D-66).
 * 아이디는 표시명과 다르다 — 표시명 "최준환[서울_18반]", 아이디 "devjunsday".
 * 그래서 사용자가 직접 입력해야 하고, 코드로 본인 것임을 확인한다.
 */
export const mattermostSendSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Mattermost 아이디를 입력해주세요.')
    .max(64)
    .regex(/^@?[A-Za-z0-9._-]+$/, '아이디 형식이 아닙니다.'),
  realName: z.string().trim().min(1, '이름을 입력해주세요.').max(20),
  classNo: z.string().trim().min(1, '반을 입력해주세요.').max(10),
});
export type MattermostSendInput = z.infer<typeof mattermostSendSchema>;

export const mattermostVerifySchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, '6자리 숫자를 입력해주세요.'),
});
export type MattermostVerifyInput = z.infer<typeof mattermostVerifySchema>;

export const displayNameSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('NICKNAME'),
    nickname: z
      .string()
      .trim()
      .min(NICKNAME_MIN, `닉네임은 ${NICKNAME_MIN}자 이상이어야 합니다.`)
      .max(NICKNAME_MAX, `닉네임은 ${NICKNAME_MAX}자까지 쓸 수 있습니다.`),
  }),
  z.object({ type: z.literal('REAL') }),
]);
export type DisplayNameInput = z.infer<typeof displayNameSchema>;

export const interestSelectionSchema = z.object({
  interestIds: z.array(z.string().uuid()).max(50),
});
export type InterestSelectionInput = z.infer<typeof interestSelectionSchema>;

export const REQUEST_ENTRY_POINTS = [
  'SIMILAR',
  'INTEREST_DETAIL',
  'PROFILE',
  'POST',
  'GRAPH',
  'NETWORK_FAILED',
] as const;

export const connectionRequestSchema = z.object({
  targetId: z.string().uuid(),
  /** 메시지는 필수다 (docs/09 §2). 빈 요청은 친구 추가와 같다. */
  message: z.string().trim().min(1, '메시지를 입력해주세요.').max(200),
  entryPoint: z.enum(REQUEST_ENTRY_POINTS),
});
export type ConnectionRequestInput = z.infer<typeof connectionRequestSchema>;

export const followUpResponseSchema = z.object({
  started: z.boolean(),
  reason: z.enum(['NOT_FOUND', 'NO_TIME', 'BURDEN', 'OTHER']).optional(),
  askCounterpart: z.boolean().optional(),
});
export type FollowUpResponseInput = z.infer<typeof followUpResponseSchema>;

export const postSchema = z.object({
  interestId: z.string().uuid(),
  content: z.string().trim().min(1).max(300),
});
export type PostInput = z.infer<typeof postSchema>;

export const suggestionSchema = z.object({
  name: z.string().trim().min(1).max(30),
});
export type SuggestionInput = z.infer<typeof suggestionSchema>;

export const reportSchema = z.object({
  targetType: z.enum(['USER', 'CONNECTION_REQUEST', 'POST']),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(1).max(50),
  detail: z.string().trim().max(500).optional(),
});
export type ReportInput = z.infer<typeof reportSchema>;

export const analyticsBatchSchema = z.object({
  events: z
    .array(
      z.object({
        name: z.string().min(1).max(64),
        props: z.record(z.unknown()).optional(),
        occurredAt: z.string().datetime().optional(),
      }),
    )
    .max(50),
});
export type AnalyticsBatchInput = z.infer<typeof analyticsBatchSchema>;

import { z } from 'zod';
import { CATEGORY_NAME_MAX, PROFILE_MESSAGE_MAX, QUESTION_TEXT_MAX } from './admin';
import { CLASS_COUNT } from './campus';

/**
 * 요청 본문 검증 규칙. 서버(파이프)와 프론트(폼)가 같은 스키마를 쓴다.
 * 길이 상한처럼 파라미터에 묶인 값은 여기서 최대치를 두고,
 * 실제 상한은 서버가 DB의 파라미터로 다시 확인한다(design/20 §9).
 */

/** "18반" 형식. 반은 1~[CLASS_COUNT] 중에서 고른다(D-73). */
export const classNoSchema = z
  .string()
  .trim()
  .regex(/^\d{1,2}반$/, '반을 골라주세요.')
  .refine((value) => {
    const n = Number(value.replace('반', ''));
    return n >= 1 && n <= CLASS_COUNT;
  }, `반은 1반부터 ${CLASS_COUNT}반까지 있습니다.`);

export const identitySchema = z.object({
  realName: z.string().trim().min(1, '이름을 입력해주세요.').max(20, '이름은 20자까지입니다.'),
  classNo: classNoSchema,
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
  realName: z.string().trim().min(1, '이름을 입력해주세요.').max(20, '이름은 20자까지입니다.'),
  classNo: classNoSchema,
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

export const INTEREST_NAME_MAX = 20;

/**
 * 사용자가 관심사를 직접 추가한다 (D-74).
 * confirmSimilar는 "비슷한 것이 있다"는 안내를 보고도 추가하겠다는 확인이다.
 * 같은 뜻(EXACT)이면 확인해도 만들 수 없다.
 */
export const createInterestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '관심사 이름을 입력해주세요.')
    .max(INTEREST_NAME_MAX, `관심사 이름은 ${INTEREST_NAME_MAX}자까지 쓸 수 있습니다.`)
    .regex(/^[가-힣a-zA-Z0-9 .+#·/&-]+$/, '한글, 영문, 숫자와 몇 가지 기호만 쓸 수 있습니다.'),
  categoryId: z.string().uuid(),
  confirmSimilar: z.boolean().optional(),
});
export type CreateInterestInput = z.infer<typeof createInterestSchema>;

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

/**
 * 프로필 메시지(D-85). 빈 문자열을 보내면 지운다. 줄바꿈은 두 줄까지만 — 사람 패널의 한 줄 소개다.
 */
export const profileMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .max(PROFILE_MESSAGE_MAX, `프로필 메시지는 ${PROFILE_MESSAGE_MAX}자까지 쓸 수 있습니다.`)
    .refine((value) => value.split(/\r?\n/).length <= 2, '줄바꿈은 한 번까지만 쓸 수 있습니다.'),
});
export type ProfileMessageInput = z.infer<typeof profileMessageSchema>;

/** 관심사 분류(D-86). 이름은 관심사 이름과 같은 글자 규칙을 따른다. */
export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, '분류 이름을 입력해주세요.')
  .max(CATEGORY_NAME_MAX, `분류 이름은 ${CATEGORY_NAME_MAX}자까지 쓸 수 있습니다.`)
  .regex(/^[가-힣a-zA-Z0-9 .+#·/&-]+$/, '한글, 영문, 숫자와 몇 가지 기호만 쓸 수 있습니다.');

export const createCategorySchema = z.object({
  name: categoryNameSchema,
  kind: z.enum(['INTEREST', 'ATTRIBUTE']).default('INTEREST'),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z
  .object({
    name: categoryNameSchema.optional(),
    /** 순서. 0부터. 같은 값을 가진 것 앞에 들어간다 */
    sortOrder: z.number().int().min(0).max(999).optional(),
  })
  .refine((value) => value.name !== undefined || value.sortOrder !== undefined, '바꿀 것이 없습니다.');
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/** 네트워킹 질문(D-87). 주제별 질문과 포괄 질문이 같은 본문을 쓴다. */
export const questionTextSchema = z
  .string()
  .trim()
  .min(1, '질문을 입력해주세요.')
  .max(QUESTION_TEXT_MAX, `질문은 ${QUESTION_TEXT_MAX}자까지 쓸 수 있습니다.`);

export const createQuestionSchema = z.object({ text: questionTextSchema });
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

export const updateQuestionSchema = z
  .object({
    text: questionTextSchema.optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
    /** 포괄 질문에만 뜻이 있다 */
    active: z.boolean().optional(),
  })
  .refine(
    (value) => value.text !== undefined || value.sortOrder !== undefined || value.active !== undefined,
    '바꿀 것이 없습니다.',
  );
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

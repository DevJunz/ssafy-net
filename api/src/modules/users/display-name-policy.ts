import type { User } from '@prisma/client';

/** 표시명은 하루에 한 번 바꿀 수 있다(docs/12 §3, design/22 §12). */
export const DISPLAY_NAME_CHANGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * 다음 표시명 변경이 가능한 시각. 지금 바꿀 수 있으면 null.
 *
 * 온보딩에서 고른 첫 표시명은 "변경"으로 세지 않는다 — `nicknameChangedAt` 이
 * `onboardedAt` 보다 앞이면 온보딩 때의 선택이다. 온보딩 중에는 `onboardedAt` 이
 * 없으므로 몇 번을 골라도 막히지 않는다.
 */
export function nextDisplayNameChangeAt(
  user: Pick<User, 'nicknameChangedAt' | 'onboardedAt'>,
  now = new Date(),
): Date | null {
  const last = user.nicknameChangedAt;
  if (!last || !user.onboardedAt || last <= user.onboardedAt) return null;
  const next = new Date(last.getTime() + DISPLAY_NAME_CHANGE_INTERVAL_MS);
  return next > now ? next : null;
}

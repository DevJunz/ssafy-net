/**
 * 주말에는 메신저 DM 을 보내지 않는다 (D-95).
 *
 * 막히는 것은 Mattermost DM 하나뿐이다. 앱 알림함은 주말에도 그대로 쌓인다 —
 * 알림함은 끌 수 없다는 것이 D-89 의 규칙이고, 주말에 일어난 일을 사용자가 영영
 * 모르게 되면 안 된다. 미룬 DM 은 발송 기록에 표시만 해 두었다가 월요일 09:00 에
 * 사람마다 한 통으로 요약해 보낸다.
 *
 * 미룬 것을 **시각이 아니라 표시로** 찾는 이유: 월요일 아침에 서버가 꺼져 있었거나
 * 잡이 실패해도 다음 실행이 그대로 이어받는다. 발송 기록에는 만들어진 시각 칸이
 * 없기도 하다(`notification_delivery`).
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 발송을 미룬 표시. 월요일 요약이 이 표시를 찾아 센다. */
export const WEEKEND_HELD = '주말(D-95) — 월요일 요약 대기';

/** 요약에 실어 보낸 뒤의 표시. 같은 것을 두 번 세지 않는다. */
export const WEEKEND_SUMMARIZED = '주말(D-95) — 월요일 요약에 포함';

/**
 * 토·일(KST)인가.
 *
 * 프로세스 TZ 에 기대지 않는다. 컨테이너는 `TZ=Asia/Seoul` 이지만(design/20 §13)
 * 이것은 사람이 쉬는 날의 규칙이라 서버 설정이 어긋나도 흔들리면 안 된다.
 */
export function isWeekendKst(now: Date = new Date()): boolean {
  const day = new Date(now.getTime() + KST_OFFSET_MS).getUTCDay();
  return day === 0 || day === 6;
}

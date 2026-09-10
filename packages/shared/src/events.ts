/**
 * 수집할 사건 목록 (docs/14 §6, design/22 §14).
 *
 * 원칙: **서버가 볼 수 있는 것은 서버가 기록한다**(design/20 §10). 프론트는 서버가 볼 수 없는 것,
 * 즉 화면 안에서만 일어나는 클릭만 보낸다. 그래서 열람(graph.view, profile.view …)은 서버 목록에 있다 —
 * 그 요청 자체가 열람이다. 프론트가 같은 이름을 보내면 `POST /api/events` 가 거부한다(중복 방지).
 *
 * 요청·연결·후속 확인·Network 처럼 표에 상태로 남는 사건은 이벤트로 따로 남기지 않는다. 지표는 표에서 센다.
 */
export const CLIENT_EVENTS = [
  'onboarding.invite_open',
  'onboarding.login',
  'onboarding.identity',
  'onboarding.display_name',
  'onboarding.interests_saved',
  'onboarding.notification_setup',
  'onboarding.completed',

  'graph.interest_click',
  'graph.person_click',
  /** props: { from: 'me'|'interest', to: 'me'|'interest', interestCount, via: 'panel'|'shift'|'chip'|'back' } */
  'graph.anchor_change',
  /** props: { on: false } — 켜는 것은 서버가 본다(GET /graph/similar) */
  'graph.similar_mode',
  'graph.network_mode',
  'graph.background_click',
  'graph.more_click',

  'profile.request_button',

  'network.card_view',

  'post.impression',
  'post.author_click',

  'notification.settings_changed',
] as const;

export const SERVER_EVENTS = [
  /** props: { anchor: 'me'|'interest', interestIds?: string[], interestCount } */
  'graph.view',
  /** props: { on: true } */
  'graph.similar_mode',
  /** props: { targetId, relation } */
  'profile.view',
  /** props: { interestId } */
  'interest.detail_view',
  /** props: { interestId, offset } */
  'interest.people_view',
  /** props: { added, removed } */
  'interest.changed',
  /** props: { interestId, name } */
  'interest.created',
  /** props: { deliveryId, type } */
  'notification.clicked',
] as const;

export type ClientEventName = (typeof CLIENT_EVENTS)[number];
export type ServerEventName = (typeof SERVER_EVENTS)[number];
export type EventName = ClientEventName | ServerEventName;

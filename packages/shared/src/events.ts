/**
 * 수집할 사건 목록 (docs/14 §6, design/22 §14).
 *
 * (서버)로 표시된 것은 서버가 직접 남긴다. 프론트가 보내면 안 된다.
 * 서버가 아는 것을 프론트에 의존하지 않는다(design/20 §10).
 */
export const CLIENT_EVENTS = [
  'onboarding.invite_open',
  'onboarding.login',
  'onboarding.identity',
  'onboarding.display_name',
  'onboarding.interests_saved',
  'onboarding.notification_setup',
  'onboarding.completed',

  'graph.view',
  'graph.interest_click',
  'graph.person_click',
  'graph.anchor_change',
  'graph.similar_mode',
  'graph.network_mode',
  'graph.background_click',
  'graph.more_click',

  'profile.view',
  'profile.request_button',

  'network.card_view',

  'post.impression',
  'post.author_click',

  'notification.settings_changed',

  'interest.changed',
  'interest.suggested',
] as const;

export const SERVER_EVENTS = [
  'request.sent',
  'request.read',
  'request.accepted',
  'request.rejected',
  'request.expired',
  'request.cancelled',
  'request.reminder_sent',

  'connection.established',
  'connection.marked_started',
  'connection.initiator_reminded',

  'followup.asked',
  'followup.responded',

  'network.candidates_computed',
  'network.exposed',
  'network.joined',
  'network.declined',
  'network.activated',
  'network.expired',

  'post.created',

  'notification.sent',
  'notification.clicked',

  'report.created',
  'report.resolved',
] as const;

export type ClientEventName = (typeof CLIENT_EVENTS)[number];
export type ServerEventName = (typeof SERVER_EVENTS)[number];
export type EventName = ClientEventName | ServerEventName;

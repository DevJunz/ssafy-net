import type { NotificationType } from '@prisma/client';

/**
 * 알림 종류별 규칙 (design/21 §7, docs/02 FR-14).
 *
 * 세 가지를 한곳에 모은다.
 *   category       즉시인가 묶음인가 (FR-14.2)
 *   actionRequired 배지에 세는가 (D-31 — 배지는 처리가 필요한 것의 수다)
 *   render         메신저로 나갈 문구
 *
 * 문구 규칙 (FR-14.3, docs/12 §7)
 *   - 앱을 열기 전에 "볼 가치가 있는지" 판단할 수 있어야 한다
 *   - **실명은 성립 알림에만 넣는다.** 그 전에는 표시명뿐이다
 *   - 알림에 수락 같은 행동 버튼을 두지 않는다. 링크 하나만 준다(D-25)
 */

export interface NotificationPayload {
  displayName?: string;
  realName?: string;
  mattermostUsername?: string;
  commonInterests?: string[];
  messagePreview?: string;
  counterpartName?: string;
  memberNames?: string[];
  daysLeft?: number;
  reason?: string;
  [key: string]: unknown;
}

interface Rule {
  category: 'IMMEDIATE' | 'DIGEST';
  actionRequired: boolean;
  render: (payload: NotificationPayload) => string;
}

const interests = (payload: NotificationPayload): string =>
  payload.commonInterests?.length
    ? `공통 관심사 ${payload.commonInterests.length}개: ${payload.commonInterests.join(', ')}`
    : '공통 관심사는 없습니다.';

export const NOTIFICATION_RULES: Record<NotificationType, Rule> = {
  CONNECTION_REQUEST_RECEIVED: {
    category: 'IMMEDIATE',
    actionRequired: true,
    render: (p) =>
      [
        `**${p.displayName}**님이 연결을 요청했습니다.`,
        interests(p),
        p.messagePreview ? `> ${p.messagePreview}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
  },

  CONNECTION_REQUEST_EXPIRING: {
    category: 'IMMEDIATE',
    actionRequired: true,
    render: (p) =>
      `**${p.displayName}**님의 연결 요청이 내일 만료됩니다. ${interests(p)}`,
  },

  CONNECTION_ACCEPTED: {
    category: 'IMMEDIATE',
    actionRequired: true,
    // 성립 알림에만 실명이 들어간다. 여기서부터 서로를 알아볼 수 있다.
    render: (p) =>
      [
        `**${p.realName}**님이 연결을 수락했습니다.`,
        p.mattermostUsername
          ? `메신저에서 \`@${p.mattermostUsername}\` 에게 첫 메시지를 보내주세요.`
          : '',
        interests(p),
      ]
        .filter(Boolean)
        .join('\n'),
  },

  CONNECTION_INITIATOR_REMINDER: {
    category: 'IMMEDIATE',
    actionRequired: false,
    render: (p) =>
      [
        `아직 **${p.realName}**님에게 연락하지 않으셨다면 지금 보내보세요.`,
        p.mattermostUsername ? `\`@${p.mattermostUsername}\`` : '',
      ]
        .filter(Boolean)
        .join('\n'),
  },

  CONNECTION_COUNTERPART_REMINDER: {
    category: 'IMMEDIATE',
    actionRequired: false,
    render: (p) =>
      `**${p.realName}**님이 아직 연락하지 않았습니다. 먼저 연락하셔도 좋습니다.`,
  },

  CONNECTION_ASK_COUNTERPART: {
    category: 'IMMEDIATE',
    actionRequired: false,
    render: (p) =>
      `**${p.realName}**님이 메신저에서 회원님을 찾지 못했습니다. 먼저 연락해주시면 좋겠습니다.`,
  },

  FOLLOW_UP_ASK: {
    category: 'IMMEDIATE',
    actionRequired: true,
    render: (p) => `**${p.counterpartName}**님과 대화를 시작하셨나요?`,
  },

  NETWORK_RECOMMENDED: {
    category: 'IMMEDIATE',
    actionRequired: false,
    render: (p) => [p.reason ?? '새 네트워크 추천이 있습니다.', interests(p)].join('\n'),
  },

  NETWORK_EXPIRING: {
    category: 'IMMEDIATE',
    actionRequired: false,
    render: (p) => `참여를 기다리는 네트워크가 내일 만료됩니다. ${p.reason ?? ''}`,
  },

  NETWORK_ACTIVATED: {
    category: 'IMMEDIATE',
    actionRequired: true,
    render: (p) =>
      [
        '**네트워크가 성립되었습니다.**',
        p.memberNames?.length ? `멤버: ${p.memberNames.join(', ')}` : '',
        interests(p),
      ]
        .filter(Boolean)
        .join('\n'),
  },

  NETWORK_INITIATOR_REMINDER: {
    category: 'IMMEDIATE',
    actionRequired: false,
    render: () =>
      '아직 그룹 대화를 열지 않으셨다면 지금 멤버를 초대해주세요.',
  },

  NETWORK_MEMBER_REMINDER: {
    category: 'IMMEDIATE',
    actionRequired: false,
    render: () => '아직 초대가 없습니다. 누구든 먼저 초대해도 좋습니다.',
  },

  NETWORK_FAILED: {
    category: 'IMMEDIATE',
    actionRequired: false,
    render: () =>
      '참여 인원이 부족해 네트워크가 성립되지 않았습니다. 참여했던 분들과 1:1로 연결할 수 있습니다.',
  },

  NETWORK_ENABLED: {
    category: 'IMMEDIATE',
    actionRequired: false,
    render: () => '네트워크 추천이 시작되었습니다.',
  },

  INTEREST_MERGED: {
    category: 'IMMEDIATE',
    actionRequired: false,
    render: (p) => `관심사 ${p.reason ?? ''}가 합쳐졌습니다.`,
  },

  INTEREST_HIDDEN: {
    category: 'IMMEDIATE',
    actionRequired: false,
    render: (p) => `관심사 ${p.reason ?? ''}가 목록에서 내려갔습니다.`,
  },

  SUGGESTION_RESOLVED: {
    category: 'IMMEDIATE',
    actionRequired: false,
    render: (p) => `제안하신 관심사에 대한 답변입니다. ${p.reason ?? ''}`,
  },

  DIGEST: {
    category: 'DIGEST',
    actionRequired: false,
    render: (p) => p.reason ?? '새로운 소식이 있습니다.',
  },
};

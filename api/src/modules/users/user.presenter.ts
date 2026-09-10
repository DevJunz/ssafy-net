import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type {
  ConnectedUser,
  InterestRef,
  PublicUser,
  Relation,
  SelfUser,
} from '@ssafy-net/shared';
import { nextDisplayNameChangeAt } from './display-name-policy';

const NO_RELATION: Relation = {
  status: 'NONE',
  requestId: null,
  reRequestableAt: null,
};

/**
 * 공개 범위를 구조로 지킨다(design/20 §11, docs/12 §1).
 *
 * 사용자 표현은 세 가지뿐이고, realName이 응답에 들어갈 수 있는 곳은 셋뿐이다.
 *   (1) 연결됨 상태의 상대  (2) 성립된 Network의 참여 멤버  (3) 나 자신
 * 컨트롤러마다 if로 처리하면 한 군데를 빠뜨리는 순간 실명이 샌다.
 */
@Injectable()
export class UserPresenter {
  /** "최준환_서울_18반" — 저장하지 않고 여기서만 조합한다(design/21 §2.1). */
  fullRealName(user: User): string | null {
    if (!user.realName || !user.classNo) return null;
    return `${user.realName}_${user.campus}_${user.classNo}`;
  }

  /** 연결 전에 보이는 이름. 실명 사용자는 표시명이 곧 실명이다(FR-0.4). */
  displayName(user: User): string {
    if (user.status === 'WITHDRAWN') return '탈퇴한 사용자';
    if (user.displayNameType === 'REAL') {
      return this.fullRealName(user) ?? '이름 없음';
    }
    return user.nickname ?? '이름 없음';
  }

  toPublicUser(
    user: User,
    interests: InterestRef[] = [],
    relation: Relation = NO_RELATION,
    commonCount = 0,
  ): PublicUser {
    if (user.status === 'WITHDRAWN') {
      return {
        id: user.id,
        displayName: '탈퇴한 사용자',
        displayNameType: 'NICKNAME',
        interests: [],
        commonCount: 0,
        relation: NO_RELATION,
        profileMessage: null,
        withdrawn: true,
      };
    }

    return {
      id: user.id,
      displayName: this.displayName(user),
      displayNameType: user.displayNameType,
      interests,
      commonCount,
      relation,
      // 본인이 적은 한 줄(D-85). 연결 전에도 보인다 — 실명이 아니라 본인이 고른 말이다.
      profileMessage: user.profileMessage || null,
    };
  }

  /** 연결됨 상태의 상대와 성립 Network 멤버에게만 쓴다. */
  toConnectedUser(
    user: User,
    interests: InterestRef[] = [],
    relation: Relation = NO_RELATION,
    commonCount = 0,
  ): ConnectedUser {
    return {
      ...this.toPublicUser(user, interests, relation, commonCount),
      realName: this.fullRealName(user) ?? '',
    };
  }

  toSelfUser(user: User, interests: InterestRef[] = []): SelfUser {
    return {
      ...this.toPublicUser(user, interests, {
        status: 'SELF',
        requestId: null,
        reRequestableAt: null,
      }),
      realName: this.fullRealName(user) ?? '',
      email: user.email,
      isOperator: user.isOperator,
      status: user.status,
      requestSuspended: user.requestSuspended,
      displayNameChangeableAt:
        nextDisplayNameChangeAt(user)?.toISOString() ?? null,
      identity: {
        realName: user.realName,
        classNo: user.classNo,
        campus: user.campus,
      },
    };
  }
}

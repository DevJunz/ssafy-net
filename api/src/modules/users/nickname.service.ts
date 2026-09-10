import { Injectable } from '@nestjs/common';
import { NICKNAME_MAX, NICKNAME_MIN } from '@ssafy-net/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';

export type NicknameVerdict =
  | { ok: true }
  | {
      ok: false;
      code:
        | 'NICKNAME_TAKEN'
        | 'NICKNAME_LOOKS_LIKE_REAL_NAME'
        | 'NICKNAME_INVALID';
    };

/** 닉네임에도 실명에도 못 쓰는 말. 운영자 사칭·조직명(docs/12 §3) */
export const BANNED_WORDS = ['운영자', '관리자', 'admin', 'ssafy', '싸피'];

/**
 * 닉네임 규칙 (docs/12 §3, D-49).
 *
 * 핵심은 "다른 구성원의 실명과 같거나 유사한 닉네임 불가"다.
 * 실명 사용자로 오인시키는 것을 막기 위한 규칙이므로 판정은 넉넉하게 잡는다.
 * 유사 판정: 실명과 완전 일치, 또는 한 글자만 다른 경우.
 */
@Injectable()
export class NicknameService {
  constructor(private readonly prisma: PrismaService) {}

  async check(value: string, selfId?: string): Promise<NicknameVerdict> {
    const nickname = value.trim();

    if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) {
      return { ok: false, code: 'NICKNAME_INVALID' };
    }
    if (BANNED_WORDS.some((word) => nickname.toLowerCase().includes(word))) {
      return { ok: false, code: 'NICKNAME_INVALID' };
    }

    const taken = await this.prisma.user.findFirst({
      where: { nickname, NOT: selfId ? { id: selfId } : undefined },
      select: { id: true },
    });
    if (taken) return { ok: false, code: 'NICKNAME_TAKEN' };

    // 1,000명 규모라 전체 비교로 충분하다(design/20 §1).
    const others = await this.prisma.user.findMany({
      where: {
        status: { not: 'WITHDRAWN' },
        realName: { not: null },
        NOT: selfId ? { id: selfId } : undefined,
      },
      select: { realName: true, campus: true, classNo: true },
    });

    for (const other of others) {
      if (!other.realName) continue;
      const full = other.classNo
        ? `${other.realName}_${other.campus}_${other.classNo}`
        : other.realName;

      if (this.withinOneEdit(nickname, other.realName)) {
        return { ok: false, code: 'NICKNAME_LOOKS_LIKE_REAL_NAME' };
      }
      if (nickname === full) {
        return { ok: false, code: 'NICKNAME_LOOKS_LIKE_REAL_NAME' };
      }
    }

    return { ok: true };
  }

  /** 편집 거리 1 이하인지. 길이 차가 2 이상이면 볼 것도 없다. */
  private withinOneEdit(a: string, b: string): boolean {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;

    const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
    let i = 0;
    let j = 0;
    let edits = 0;

    while (i < shorter.length && j < longer.length) {
      if (shorter[i] === longer[j]) {
        i += 1;
        j += 1;
        continue;
      }
      edits += 1;
      if (edits > 1) return false;
      if (shorter.length === longer.length) i += 1;
      j += 1;
    }

    return true;
  }
}

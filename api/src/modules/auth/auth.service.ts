import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ParametersService } from '../parameters/parameters.service';
import type { GoogleIdentity } from './google.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parameters: ParametersService,
  ) {}

  async findActiveInvite(code: string) {
    return this.prisma.inviteCode.findFirst({ where: { code, active: true } });
  }

  /** 초대 링크가 있어야 가입할 수 있는지(D-84). 기본은 꺼짐 — Mattermost 인증이 소속 검증이다. */
  inviteRequired(): Promise<boolean> {
    return this.parameters.flag('invite_required');
  }

  /**
   * 가입 (FR-0.2, D-84).
   *
   * `invite_required` 가 켜져 있으면 옛 규칙대로 초대 링크를 연 사람만 가입한다.
   * 꺼져 있으면(기본) 누구나 Google 로 바로 가입한다 — SSAFY 만 대상이라 온보딩의
   * Mattermost 인증(D-66)이 소속 검증을 겸하므로 초대 링크가 필요 없다.
   * 초대 링크를 열고 왔으면 꺼져 있어도 어느 코드로 왔는지는 남긴다.
   */
  async resolveUser(
    identity: GoogleIdentity,
    inviteCode: string | null,
  ): Promise<User> {
    const existing = await this.prisma.user.findUnique({
      where: { googleSub: identity.sub },
    });
    if (existing) {
      await this.prisma.user.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date() },
      });
      return existing;
    }

    const required = await this.inviteRequired();
    if (required && !inviteCode) throw new AppError('INVITE_REQUIRED');

    const invite = inviteCode ? await this.findActiveInvite(inviteCode) : null;
    if (required && !invite) throw new AppError('INVITE_INVALID');

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          googleSub: identity.sub,
          email: identity.email,
          invitedByCodeId: invite?.id ?? null,
          lastSeenAt: new Date(),
        },
      });

      if (invite) {
        await tx.inviteCode.update({
          where: { id: invite.id },
          data: { usedCount: { increment: 1 } },
        });
      }

      return user;
    });
  }
}

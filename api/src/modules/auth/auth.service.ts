import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { GoogleIdentity } from './google.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveInvite(code: string) {
    return this.prisma.inviteCode.findFirst({ where: { code, active: true } });
  }

  /**
   * 가입은 초대 링크를 통해서만 가능하다(FR-0.2).
   * 소속은 검증하지 않는다(D-20). 초대 코드 보유가 유일한 경계다.
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

    if (!inviteCode) throw new AppError('INVITE_REQUIRED');

    const invite = await this.findActiveInvite(inviteCode);
    if (!invite) throw new AppError('INVITE_INVALID');

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          googleSub: identity.sub,
          email: identity.email,
          invitedByCodeId: invite.id,
          lastSeenAt: new Date(),
        },
      });

      await tx.inviteCode.update({
        where: { id: invite.id },
        data: { usedCount: { increment: 1 } },
      });

      return user;
    });
  }
}

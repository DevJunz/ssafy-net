import { Injectable, Logger } from '@nestjs/common';
import type { User } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { AppError } from '../../common/app-error';
import {
  MattermostService,
  normalize,
} from '../../infra/mattermost/mattermost.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UserPresenter } from '../users/user.presenter';

const CODE_TTL_MS = 10 * 60_000;
/** 한 사람이 코드를 다시 받을 수 있는 횟수(시간당). */
const SEND_LIMIT_PER_USER = 5;
/** 한 아이디가 코드를 받을 수 있는 횟수(시간당). 남의 아이디로 스팸을 못 보내게. */
const SEND_LIMIT_PER_TARGET = 3;
const MAX_ATTEMPTS = 5;

/**
 * Mattermost 계정 인증 (D-66).
 *
 * 이 단계가 두 가지를 동시에 한다.
 *   1. **소속 검증** — SSAFY Mattermost 계정이 있는 사람만 가입할 수 있다(D-20 대체)
 *   2. **알림 채널 확보** — 이후 모든 알림이 이 계정으로 간다(D-19 대체)
 *
 * 웹훅은 단방향이라 코드를 앱에서 다시 입력받는다.
 */
@Injectable()
export class MattermostVerificationService {
  private readonly logger = new Logger(MattermostVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mattermost: MattermostService,
    private readonly presenter: UserPresenter,
  ) {}

  /**
   * 코드 발송. 실명도 함께 받아 DM 본문에 넣는다 —
   * 이름이 틀리면 받는 사람이 바로 알아차린다(A-17, R-14의 값싼 보완).
   */
  async sendCode(
    me: User,
    input: { username: string; realName: string; classNo: string },
  ) {
    if (!this.mattermost.enabled) {
      throw new AppError(
        'INTERNAL',
        undefined,
        '메신저 인증이 아직 준비되지 않았습니다. 운영자에게 알려주세요.',
      );
    }

    const username = normalize(input.username);
    if (!/^[a-z0-9._-]{3,64}$/.test(username)) {
      throw new AppError(
        'VALIDATION_FAILED',
        undefined,
        'Mattermost 아이디 형식이 아닙니다. 프로필의 @아이디를 그대로 입력해주세요.',
      );
    }

    const taken = await this.prisma.user.findFirst({
      where: { mattermostUsername: username, NOT: { id: me.id } },
      select: { id: true },
    });
    if (taken) {
      throw new AppError(
        'VALIDATION_FAILED',
        undefined,
        '이미 다른 계정에 연결된 아이디입니다.',
      );
    }

    await this.assertNotThrottled(me.id, username);

    // 실명은 이 시점에 함께 저장한다. DM 본문에 넣어 오타를 잡기 위해서다.
    const updated = await this.prisma.user.update({
      where: { id: me.id },
      data: { realName: input.realName.trim(), classNo: input.classNo.trim() },
    });
    const fullName = this.presenter.fullRealName(updated) ?? '';

    // 운영자(웹훅 생성자)는 자기 자신에게 DM을 받을 수 없다. 코드 없이 통과시킨다.
    if (!this.mattermost.canReceiveDirectMessage(username)) {
      await this.prisma.user.update({
        where: { id: me.id },
        data: { mattermostUsername: username, mattermostVerifiedAt: new Date() },
      });
      this.logger.log(`운영자 계정 ${username} — 코드 없이 인증 처리`);
      return { sent: false, operatorBypass: true };
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');

    const result = await this.mattermost.sendDirectMessage(
      username,
      [
        '**Interest Network 인증 코드**',
        '',
        `${fullName}님, 인증 코드는 \`${code}\` 입니다.`,
        '10분 안에 입력해주세요.',
        '',
        '_이름이 본인이 아니라면 다른 분이 아이디를 잘못 입력한 것입니다. 무시하셔도 됩니다._',
      ].join('\n'),
    );

    if (!result.ok) {
      throw new AppError(
        'VALIDATION_FAILED',
        undefined,
        '그 아이디로 메시지를 보내지 못했습니다. 아이디를 다시 확인해주세요.',
      );
    }

    await this.prisma.mattermostVerification.create({
      data: {
        userId: me.id,
        username,
        code,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    return { sent: true, operatorBypass: false };
  }

  async verify(me: User, code: string) {
    const verification = await this.prisma.mattermostVerification.findFirst({
      where: { userId: me.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!verification) {
      throw new AppError('NOT_FOUND', undefined, '먼저 코드를 받아주세요.');
    }
    if (verification.expiresAt.getTime() < Date.now()) {
      throw new AppError(
        'VALIDATION_FAILED',
        undefined,
        '코드가 만료되었습니다. 다시 받아주세요.',
      );
    }
    if (verification.attempts >= MAX_ATTEMPTS) {
      throw new AppError(
        'VALIDATION_FAILED',
        undefined,
        '시도 횟수를 초과했습니다. 코드를 다시 받아주세요.',
      );
    }

    if (verification.code !== code.trim()) {
      await this.prisma.mattermostVerification.update({
        where: { id: verification.id },
        data: { attempts: { increment: 1 } },
      });
      throw new AppError(
        'VALIDATION_FAILED',
        { remaining: MAX_ATTEMPTS - verification.attempts - 1 },
        '코드가 맞지 않습니다.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.mattermostVerification.update({
        where: { id: verification.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: me.id },
        data: {
          mattermostUsername: verification.username,
          mattermostVerifiedAt: new Date(),
        },
      }),
    ]);

    return { verified: true, username: verification.username };
  }

  private async assertNotThrottled(userId: string, username: string) {
    const since = new Date(Date.now() - 3_600_000);
    const [byUser, byTarget] = await Promise.all([
      this.prisma.mattermostVerification.count({
        where: { userId, createdAt: { gte: since } },
      }),
      this.prisma.mattermostVerification.count({
        where: { username, createdAt: { gte: since } },
      }),
    ]);

    if (byUser >= SEND_LIMIT_PER_USER) {
      throw new AppError(
        'VALIDATION_FAILED',
        undefined,
        '코드를 너무 자주 요청했습니다. 잠시 후 다시 시도해주세요.',
      );
    }
    if (byTarget >= SEND_LIMIT_PER_TARGET) {
      throw new AppError(
        'VALIDATION_FAILED',
        undefined,
        '이 아이디로는 잠시 후에 다시 보낼 수 있습니다.',
      );
    }
  }
}

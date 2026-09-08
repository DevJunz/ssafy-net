import { Injectable, Logger } from '@nestjs/common';
import type { Connection, ConnectionRequest, User } from '@prisma/client';
import type {
  ConnectionDetail,
  ConnectionRequestInput,
  ConnectionSummary,
  InterestRef,
  ReceivedRequestSummary,
  RequestDetail,
  SentRequestStatus,
  SentRequestSummary,
} from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { MattermostService } from '../../infra/mattermost/mattermost.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ParametersService } from '../parameters/parameters.service';
import { UserPresenter } from '../users/user.presenter';
import { QuotaService } from './quota.service';
import { RelationService } from './relation.service';

const DAY_MS = 86_400_000;
/** 거절 직후 되돌릴 수 있는 시간(docs/07 §3.4). */
const UNDO_WINDOW_MS = 5_000;

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parameters: ParametersService,
    private readonly quota: QuotaService,
    private readonly relations: RelationService,
    private readonly presenter: UserPresenter,
    private readonly mattermost: MattermostService,
  ) {}

  // ─────────────────────────────────────────────────────────
  // 요청 보내기 (docs/09 §2~3)
  // ─────────────────────────────────────────────────────────

  async createRequest(me: User, input: ConnectionRequestInput) {
    if (me.requestSuspended) throw new AppError('REQUEST_SUSPENDED');
    if (input.targetId === me.id) throw new AppError('VALIDATION_FAILED');

    const target = await this.prisma.user.findUnique({
      where: { id: input.targetId },
    });
    if (!target || target.status !== 'ACTIVE') throw new AppError('NOT_FOUND');

    const relation = await this.relations.forUser(me.id, target.id);
    if (relation.status === 'CONNECTED') throw new AppError('ALREADY_CONNECTED');
    if (relation.status === 'REQUEST_SENT')
      throw new AppError('REQUEST_ALREADY_EXISTS');
    // 상대가 먼저 요청했으면 새 요청 대신 수락/거절로 유도한다(docs/09 §2).
    if (relation.status === 'REQUEST_RECEIVED')
      throw new AppError('REQUEST_INCOMING_EXISTS', {
        requestId: relation.requestId,
      });
    if (relation.status === 'NO_RESPONSE') {
      throw new AppError(
        'REQUEST_COOLDOWN',
        { reRequestableAt: relation.reRequestableAt },
        relation.reRequestableAt
          ? `${new Date(relation.reRequestableAt).toLocaleDateString('ko-KR')} 이후에 다시 요청할 수 있습니다.`
          : undefined,
      );
    }

    const quota = await this.quota.quota(me.id);
    if (quota.dailyUsed >= quota.dailyLimit) {
      throw new AppError('REQUEST_LIMIT_REACHED', { resetAt: quota.resetAt });
    }
    if (quota.weeklyUsed >= quota.weeklyLimit) {
      throw new AppError(
        'REQUEST_LIMIT_REACHED',
        { resetAt: quota.resetAt },
        '이번 주에 보낼 수 있는 요청을 모두 사용했습니다.',
      );
    }

    const [expiryDays, common] = await Promise.all([
      this.parameters.get('P-08'),
      this.commonInterestIds(me.id, target.id),
    ]);

    const request = await this.prisma.connectionRequest.create({
      data: {
        requesterId: me.id,
        targetId: target.id,
        message: input.message,
        entryPoint: input.entryPoint,
        // 요청 당시의 공통 관심사를 고정한다(docs/08 §3).
        commonInterestIds: common,
        expiresAt: new Date(Date.now() + expiryDays * DAY_MS),
      },
    });

    // TODO(M4): 받는 사람에게 즉시 알림. 표시명·공통 관심사·메시지 첫 줄 포함(FR-14.3).
    this.logger.log(`요청 생성 ${me.id} → ${target.id}`);

    return {
      requestId: request.id,
      quota: await this.quota.quota(me.id),
      // 같은 메시지를 반복하면 막지 않고 안내만 한다(docs/09 §3).
      warning: (await this.isRepeatedMessage(me.id, input.message))
        ? '각 사람에게 맞는 메시지를 써보세요.'
        : null,
    };
  }

  /**
   * 같은 메시지 3회 판정(I-9 → D-61 후보).
   * 공백과 문장부호를 지운 문자열이 최근 30일 내 3건 이상과 같으면 안내한다.
   */
  private async isRepeatedMessage(
    userId: string,
    message: string,
  ): Promise<boolean> {
    const normalize = (text: string) =>
      text.replace(/[\s\p{P}]/gu, '').toLowerCase();
    const target = normalize(message);

    const recent = await this.prisma.connectionRequest.findMany({
      where: {
        requesterId: userId,
        createdAt: { gte: new Date(Date.now() - 30 * DAY_MS) },
      },
      select: { message: true },
    });

    return recent.filter((row) => normalize(row.message) === target).length >= 3;
  }

  // ─────────────────────────────────────────────────────────
  // 목록
  // ─────────────────────────────────────────────────────────

  async received(me: User): Promise<ReceivedRequestSummary[]> {
    const requests = await this.prisma.connectionRequest.findMany({
      where: { targetId: me.id, status: 'PENDING', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      include: { requester: true },
    });

    const interests = await this.interestRefs(
      requests.flatMap((request) => request.commonInterestIds),
    );

    return requests.map((request) => ({
      id: request.id,
      from: this.presenter.toPublicUser(
        request.requester,
        [],
        { status: 'REQUEST_RECEIVED', requestId: request.id, reRequestableAt: null },
        request.commonInterestIds.length,
      ),
      commonInterests: this.pick(interests, request.commonInterestIds),
      commonCount: request.commonInterestIds.length,
      messagePreview: request.message.split('\n')[0].slice(0, 60),
      expiresAt: request.expiresAt.toISOString(),
      daysLeft: Math.max(
        0,
        Math.ceil((request.expiresAt.getTime() - Date.now()) / DAY_MS),
      ),
    }));
  }

  async sent(me: User): Promise<SentRequestSummary[]> {
    const requests = await this.prisma.connectionRequest.findMany({
      where: { requesterId: me.id },
      orderBy: { createdAt: 'desc' },
      include: { target: true },
    });

    const [revealDays, cooldownDays] = await Promise.all([
      this.parameters.get('P-08a'),
      this.parameters.get('P-07'),
    ]);
    const now = Date.now();

    return requests.map((request) => {
      const { status, reRequestableAt } = this.visibleSentStatus(
        request,
        revealDays,
        cooldownDays,
        now,
      );

      return {
        id: request.id,
        to: this.presenter.toPublicUser(request.target),
        createdAt: request.createdAt.toISOString(),
        status,
        reRequestableAt,
        canCancel: status === 'PENDING' && request.status === 'PENDING',
      };
    });
  }

  /**
   * 보낸 사람에게 보이는 상태 (docs/09 §6, §11).
   *
   * 거절은 통보되지 않는다. `min(거절 시각 + [P-08a], 만료 시각)`이 되기 전까지
   * 대기 중으로 보이고, 그 뒤에 만료와 구분되지 않는 "응답 없음"이 된다.
   */
  private visibleSentStatus(
    request: ConnectionRequest,
    revealDays: number,
    cooldownDays: number,
    now: number,
  ): { status: SentRequestStatus; reRequestableAt: string | null } {
    if (request.status === 'ACCEPTED') {
      return { status: 'ACCEPTED', reRequestableAt: null };
    }
    if (request.status === 'CANCELLED') {
      return { status: 'CANCELLED', reRequestableAt: null };
    }
    if (request.status === 'PENDING') {
      return now < request.expiresAt.getTime()
        ? { status: 'PENDING', reRequestableAt: null }
        : { status: 'NO_RESPONSE', reRequestableAt: null };
    }

    const terminalAt =
      request.respondedAt ?? request.expiredAt ?? request.expiresAt;
    const revealAt = Math.min(
      terminalAt.getTime() + revealDays * DAY_MS,
      request.expiresAt.getTime(),
    );

    if (now < revealAt) return { status: 'PENDING', reRequestableAt: null };

    const reRequestableAt = new Date(terminalAt.getTime() + cooldownDays * DAY_MS);
    return {
      status: 'NO_RESPONSE',
      reRequestableAt:
        reRequestableAt.getTime() > now ? reRequestableAt.toISOString() : null,
    };
  }

  // ─────────────────────────────────────────────────────────
  // 요청 상세와 처리
  // ─────────────────────────────────────────────────────────

  async requestDetail(me: User, requestId: string): Promise<RequestDetail> {
    const request = await this.prisma.connectionRequest.findUnique({
      where: { id: requestId },
      include: { requester: true },
    });
    if (!request || request.targetId !== me.id) throw new AppError('NOT_FOUND');
    if (request.status !== 'PENDING' || request.expiresAt.getTime() < Date.now()) {
      throw new AppError('ALREADY_HANDLED');
    }

    // 수신자가 처음 열어본 시각. "요청 확인까지 시간"(docs/14 §2.4)의 재료다.
    if (!request.readAt) {
      await this.prisma.connectionRequest.update({
        where: { id: request.id },
        data: { readAt: new Date() },
      });
    }

    const [interests, theirInterests] = await Promise.all([
      this.interestRefs(request.commonInterestIds),
      this.prisma.userInterest.findMany({
        where: { userId: request.requesterId },
        include: { interest: true },
      }),
    ]);

    const commonSet = new Set(request.commonInterestIds);
    const allRefs: InterestRef[] = theirInterests
      .map((row) => ({
        id: row.interest.id,
        name: row.interest.name,
        categoryId: row.interest.categoryId,
        isCommon: commonSet.has(row.interest.id),
      }))
      .sort((a, b) => Number(b.isCommon) - Number(a.isCommon));

    return {
      id: request.id,
      from: this.presenter.toPublicUser(
        request.requester,
        allRefs,
        { status: 'REQUEST_RECEIVED', requestId: request.id, reRequestableAt: null },
        request.commonInterestIds.length,
      ),
      commonInterests: this.pick(interests, request.commonInterestIds),
      message: request.message,
      createdAt: request.createdAt.toISOString(),
      expiresAt: request.expiresAt.toISOString(),
      daysLeft: Math.max(
        0,
        Math.ceil((request.expiresAt.getTime() - Date.now()) / DAY_MS),
      ),
      // 닉네임 사용자만 "수락하면 내 실명이 공개됩니다" 확인을 거친다(docs/07 §3.3).
      revealsMyRealName: me.displayNameType === 'NICKNAME',
      myRealName: this.presenter.fullRealName(me) ?? '',
    };
  }

  /**
   * 수락 (docs/09 §5).
   * 양쪽이 연결되고 실명이 동시에 공개된다. 시작자는 요청을 보낸 사람이다(D-15).
   */
  async accept(me: User, requestId: string): Promise<ConnectionDetail> {
    const connection = await this.prisma.$transaction(async (tx) => {
      const request = await tx.connectionRequest.findUnique({
        where: { id: requestId },
      });
      if (!request || request.targetId !== me.id) throw new AppError('NOT_FOUND');
      if (request.status !== 'PENDING' || request.expiresAt.getTime() < Date.now()) {
        throw new AppError('ALREADY_HANDLED');
      }

      const now = new Date();
      await tx.connectionRequest.update({
        where: { id: request.id },
        data: { status: 'ACCEPTED', respondedAt: now },
      });

      // 서로 동시에 요청한 경우 한쪽 수락으로 양쪽을 정리한다.
      // 시작자는 먼저 보낸 사람이다(docs/07 §3.3).
      const reverse = await tx.connectionRequest.findFirst({
        where: {
          requesterId: request.targetId,
          targetId: request.requesterId,
          status: 'PENDING',
        },
      });
      if (reverse) {
        await tx.connectionRequest.update({
          where: { id: reverse.id },
          data: { status: 'ACCEPTED', respondedAt: now },
        });
      }

      const initiatorId =
        reverse && reverse.createdAt < request.createdAt
          ? reverse.requesterId
          : request.requesterId;

      const [userAId, userBId] = [request.requesterId, request.targetId].sort();

      return tx.connection.create({
        data: {
          userAId,
          userBId,
          requestId: request.id,
          initiatorId,
        },
      });
    });

    // TODO(M4): 요청 보낸 사람에게 즉시 알림 "○○님이 수락했습니다" → 연결 성립 화면 직행.
    return this.connectionDetail(me, connection.id);
  }

  /** 거절 (docs/09 §6). 상대에게 알리지 않는다. 5초 안에 되돌릴 수 있다. */
  async reject(me: User, requestId: string) {
    const request = await this.prisma.connectionRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.targetId !== me.id) throw new AppError('NOT_FOUND');
    if (request.status !== 'PENDING') throw new AppError('ALREADY_HANDLED');

    const now = new Date();
    await this.prisma.connectionRequest.update({
      where: { id: request.id },
      data: { status: 'REJECTED', respondedAt: now },
    });

    return {
      undoUntil: new Date(now.getTime() + UNDO_WINDOW_MS).toISOString(),
      notice: '요청을 거절했습니다. 상대에게는 알려지지 않습니다.',
    };
  }

  async undoReject(me: User, requestId: string) {
    const request = await this.prisma.connectionRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.targetId !== me.id) throw new AppError('NOT_FOUND');
    if (request.status !== 'REJECTED' || !request.respondedAt) {
      throw new AppError('ALREADY_HANDLED');
    }
    if (Date.now() - request.respondedAt.getTime() > UNDO_WINDOW_MS) {
      throw new AppError('UNDO_WINDOW_PASSED');
    }

    await this.prisma.connectionRequest.update({
      where: { id: request.id },
      data: { status: 'PENDING', respondedAt: null, rejectUndoneAt: new Date() },
    });
    return { ok: true };
  }

  /** 취소 (docs/09 §8). 조용히 사라지고, 횟수는 돌려주지 않는다. */
  async cancel(me: User, requestId: string) {
    const request = await this.prisma.connectionRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.requesterId !== me.id) throw new AppError('NOT_FOUND');
    if (request.status !== 'PENDING') throw new AppError('ALREADY_HANDLED');

    await this.prisma.connectionRequest.update({
      where: { id: request.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────
  // 연결
  // ─────────────────────────────────────────────────────────

  async list(me: User): Promise<ConnectionSummary[]> {
    const connections = await this.prisma.connection.findMany({
      where: { OR: [{ userAId: me.id }, { userBId: me.id }] },
      orderBy: { establishedAt: 'desc' },
      include: { userA: true, userB: true },
    });

    return Promise.all(
      connections.map((connection) => this.toSummary(me, connection)),
    );
  }

  async connectionDetail(me: User, id: string): Promise<ConnectionDetail> {
    const connection = await this.prisma.connection.findUnique({
      where: { id },
      include: { userA: true, userB: true, request: true },
    });
    if (
      !connection ||
      (connection.userAId !== me.id && connection.userBId !== me.id)
    ) {
      throw new AppError('NOT_FOUND');
    }

    const summary = await this.toSummary(me, connection);
    const counterpart =
      connection.userAId === me.id ? connection.userB : connection.userA;
    const counterpartName = summary.counterpart.realName;
    const myName = this.presenter.fullRealName(me) ?? '';

    // 메신저에서 찾는 수단은 실명이 아니라 아이디다(D-66).
    // 실제 Mattermost 표시명은 "최준환[서울_18반]" 형식이라 실명으로는 검색되지 않는다.
    const username = counterpart.mattermostUsername;
    const link = username ? this.mattermost.directMessageLink(username) : null;
    const target = username ? `@${username}` : `${counterpartName}님`;

    // "누가, 누구에게, 무엇을"을 서버가 완성해서 준다(FR-11.3, NFR-3a).
    // 화면마다 문구가 달라지면 안 된다.
    const action =
      summary.myRole === 'INITIATOR'
        ? {
            text: `${myName.split('_')[0]}님, 사내 메신저에서 ${target}에게 첫 메시지를 보내주세요.`,
            copyText: username ? `@${username}` : counterpartName,
            buttonLabel: '메신저에서 메시지를 보냈어요',
            mattermostUsername: username,
            mattermostLink: link,
          }
        : {
            text: `${counterpartName.split('_')[0]}님이 먼저 연락할 예정입니다. 먼저 연락하셔도 좋습니다.`,
            copyText: username ? `@${username}` : counterpartName,
            buttonLabel: '연락을 받았어요',
            mattermostUsername: username,
            mattermostLink: link,
          };

    return {
      ...summary,
      requestMessage: connection.request?.message ?? null,
      action,
    };
  }

  /** "메신저에서 메시지를 보냈어요" / "연락을 받았어요" (docs/07 §3.6). */
  async markStarted(me: User, id: string) {
    const connection = await this.prisma.connection.findUnique({
      where: { id },
    });
    if (
      !connection ||
      (connection.userAId !== me.id && connection.userBId !== me.id)
    ) {
      throw new AppError('NOT_FOUND');
    }

    const isInitiator = connection.initiatorId === me.id;
    await this.prisma.connection.update({
      where: { id },
      data: isInitiator
        ? { initiatorMarkedAt: new Date() }
        : { counterpartMarkedAt: new Date() },
    });

    // 상대에게 알리지 않는다. 메신저에서 이미 알게 된다.
    return { ok: true };
  }

  private async toSummary(
    me: User,
    connection: Connection & { userA: User; userB: User },
  ): Promise<ConnectionSummary> {
    const counterpart =
      connection.userAId === me.id ? connection.userB : connection.userA;

    const commonIds = await this.commonInterestIds(me.id, counterpart.id);
    const refs = await this.interestRefs(commonIds);

    return {
      id: connection.id,
      counterpart: this.presenter.toConnectedUser(
        counterpart,
        [],
        { status: 'CONNECTED', requestId: null, reRequestableAt: null },
        commonIds.length,
      ),
      // 연결 화면의 공통 관심사는 현재 기준으로 갱신된다(docs/08 §3).
      commonInterests: this.pick(refs, commonIds),
      establishedAt: connection.establishedAt.toISOString(),
      myRole: connection.initiatorId === me.id ? 'INITIATOR' : 'COUNTERPART',
      started: Boolean(
        connection.initiatorId === me.id
          ? connection.initiatorMarkedAt
          : connection.counterpartMarkedAt,
      ),
    };
  }

  // ─────────────────────────────────────────────────────────

  private async commonInterestIds(a: string, b: string): Promise<string[]> {
    const rows = await this.prisma.userInterest.findMany({
      where: { userId: { in: [a, b] } },
      select: { userId: true, interestId: true },
    });
    const mine = new Set(
      rows.filter((row) => row.userId === a).map((row) => row.interestId),
    );
    return rows
      .filter((row) => row.userId === b && mine.has(row.interestId))
      .map((row) => row.interestId);
  }

  private async interestRefs(ids: string[]): Promise<Map<string, InterestRef>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const interests = await this.prisma.interest.findMany({
      where: { id: { in: unique } },
      orderBy: { sortOrder: 'asc' },
    });
    return new Map(
      interests.map((interest) => [
        interest.id,
        {
          id: interest.id,
          name: interest.name,
          categoryId: interest.categoryId,
        },
      ]),
    );
  }

  private pick(map: Map<string, InterestRef>, ids: string[]): InterestRef[] {
    return ids
      .map((id) => map.get(id))
      .filter((ref): ref is InterestRef => Boolean(ref));
  }
}

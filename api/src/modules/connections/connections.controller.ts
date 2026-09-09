import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import {
  connectionRequestSchema,
  followUpResponseSchema,
  REQUEST_ENTRY_POINTS,
  type ConnectionRequestInput,
  type FollowUpResponseInput,
} from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthGuard, OnboardedGuard } from '../auth/auth.guard';
import { ConnectionsService } from './connections.service';
import { FollowUpService } from './follow-up.service';
import { QuotaService } from './quota.service';

const REQUEST_ID = { name: 'id', description: '연결 요청 UUID' };
const CONNECTION_ID = { name: 'id', description: '연결 UUID' };

@ApiTags('연결')
@ApiCookieAuth('sn_session')
@Controller()
@UseGuards(AuthGuard, OnboardedGuard)
export class ConnectionsController {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly quota: QuotaService,
    private readonly followUps: FollowUpService,
  ) {}

  @Get('me/request-quota')
  @ApiOperation({
    summary: '내 요청 잔여 횟수',
    description:
      '`{ dailyLimit, dailyUsed, weeklyLimit, weeklyUsed, throttled, resetAt }`. ' +
      '기준은 KST 달력 하루 / 달력 주(월~일)(D-60). 기본 일 5 · 주 20(P-06), 취소한 것도 센다. ' +
      '수락률 10% 미만이면 `throttled=true`가 되고 일 상한이 2로 내려간다(docs/09 §3).',
  })
  requestQuota(@CurrentUser() user: User) {
    return this.quota.quota(user.id);
  }

  @Post('connection-requests')
  @ApiOperation({
    summary: '연결 요청 보내기',
    description:
      '메시지는 필수다(docs/09 §2). 빈 요청은 친구 추가와 같다. **공통 관심사 0개여도 보낼 수 있다.** 요청 시점의 공통 관심사를 고정해 저장한다(docs/08 §3).\n\n' +
      '서버가 순서대로 확인한다:\n' +
      '1. 정지 → `403 REQUEST_SUSPENDED`\n' +
      '2. 자기 자신 → 400\n' +
      '3. 이미 연결됨 → `409 ALREADY_CONNECTED`\n' +
      '4. 내 PENDING 요청 존재 → `409 REQUEST_ALREADY_EXISTS`\n' +
      '5. 상대가 먼저 보낸 요청 존재 → `409 REQUEST_INCOMING_EXISTS` (수락으로 유도)\n' +
      '6. 재요청 대기 중(거절 후 P-07 14일) → `409 REQUEST_COOLDOWN` + `reRequestableAt`\n' +
      '7. 상한 → `429 REQUEST_LIMIT_REACHED` + `resetAt`\n' +
      '8. 메시지 1~200자(P-16)\n' +
      '9. 최근 30일 같은 메시지 3회 → 막지 않고 응답에 `warning`(D-61)\n\n' +
      '성공 시 상대에게 즉시 알림(`CONNECTION_REQUEST_RECEIVED`: 표시명·공통 관심사·메시지 첫 줄).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['targetId', 'message', 'entryPoint'],
      properties: {
        targetId: { type: 'string', format: 'uuid' },
        message: { type: 'string', minLength: 1, maxLength: 200, example: '러닝 얘기 나누고 싶어서요.' },
        entryPoint: {
          type: 'string',
          enum: [...REQUEST_ENTRY_POINTS],
          description: '어느 화면에서 요청했는가. 측정용(docs/14)',
        },
      },
    },
  })
  create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(connectionRequestSchema))
    body: ConnectionRequestInput,
  ) {
    return this.connections.createRequest(user, body);
  }

  @Get('connection-requests')
  @ApiOperation({
    summary: '받은 / 보낸 요청 목록',
    description:
      'Connections 화면의 "받은 요청" · "보낸 요청" 탭.\n\n' +
      '- `box=received`: PENDING만. 거절·만료된 것은 사라진다(docs/09 §7)\n' +
      '- `box=sent`: 거절된 요청은 최대 하루(D-32) 동안 `PENDING`으로 보이다가 "응답 없음"으로 바뀐다. 거절은 통보하지 않는다(D-07)',
  })
  @ApiQuery({ name: 'box', enum: ['received', 'sent'], description: '필수' })
  list(@CurrentUser() user: User, @Query('box') box: string | undefined) {
    if (box === 'sent') return this.connections.sent(user);
    if (box === 'received') return this.connections.received(user);
    throw new AppError('VALIDATION_FAILED', undefined, 'box는 received 또는 sent여야 합니다.');
  }

  @Get('connection-requests/:id')
  @ApiOperation({
    summary: '요청 상세 (요청 상세 Overlay)',
    description:
      '보낸 사람 표시명, 공통 관심사, 메시지 전문. 수신자가 열면 `readAt`을 기록한다. 당사자만 볼 수 있다.',
  })
  @ApiParam(REQUEST_ID)
  detail(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.connections.requestDetail(user, id);
  }

  @Post('connection-requests/:id/accept')
  @ApiOperation({
    summary: '요청 수락 → 연결 성립',
    description:
      '수신자만. 트랜잭션으로 요청 `ACCEPTED` → `Connection` 생성(시작자 = 요청 보낸 사람, D-15) → ' +
      '역방향 PENDING 요청이 있으면 함께 정리하고 먼저 보낸 쪽이 시작자 → 양쪽 알림 → 관련 알림 `resolvedAt`.\n\n' +
      '수락 시 **양쪽 실명이 동시에 공개**된다(D-11). 응답은 `GET /api/connections/:id`와 같은 형태라 연결 성립 화면을 추가 호출 없이 바로 그린다(docs/07 §3.3). ' +
      '이미 처리됐으면 `409 ALREADY_HANDLED`.',
  })
  @ApiParam(REQUEST_ID)
  accept(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.connections.accept(user, id);
  }

  @Post('connection-requests/:id/reject')
  @ApiOperation({
    summary: '요청 거절',
    description:
      '수신자만. 확인 대화상자 없이 바로 거절하고 응답에 `undoUntil`(5초)을 준다(docs/07 §3.4). ' +
      '상대에게 알림은 **없다**(D-07). 상대 화면에서는 최대 하루 뒤 "응답 없음"으로 바뀌고, 14일간 재요청할 수 없다(P-07).',
  })
  @ApiParam(REQUEST_ID)
  reject(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.connections.reject(user, id);
  }

  @Post('connection-requests/:id/reject/undo')
  @ApiOperation({
    summary: '거절 되돌리기 (5초 이내)',
    description: '거절 직후 5초 안에만. 지나면 `409 UNDO_WINDOW_PASSED`. 요청은 다시 PENDING이 된다.',
  })
  @ApiParam(REQUEST_ID)
  undoReject(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.connections.undoReject(user, id);
  }

  @Delete('connection-requests/:id')
  @ApiOperation({
    summary: '보낸 요청 취소 (S6)',
    description:
      '발신자만, 처리 전에만. 상대의 받은 요청에서 조용히 사라진다. ' +
      '**횟수는 복구하지 않고** 같은 사람에게 당일 재요청할 수 없다(docs/09 §8).',
  })
  @ApiParam(REQUEST_ID)
  cancel(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.connections.cancel(user, id);
  }

  @Get('connections')
  @ApiOperation({
    summary: '연결됨 목록',
    description:
      'Connections 화면의 "연결됨" 탭. 각 항목에 상대 `ConnectedUser`(실명 포함), 공통 관심사(현재 기준), 요청 메시지, 시작자, 대화 시작 여부. ' +
      '탈퇴한 상대는 "탈퇴한 사용자"로 남고 실명·메시지는 지워진다(D-64). 연결 해제는 없다(D-42).',
  })
  connectionList(@CurrentUser() user: User) {
    return this.connections.list(user);
  }

  @Get('connections/:id')
  @ApiOperation({
    summary: '연결 상세 (연결 성립 Overlay)',
    description:
      '`{ id, counterpart(ConnectedUser), commonInterests, requestMessage, establishedAt, myRole, action, started }`.\n\n' +
      '- `action.text`는 서버가 완성한 문장이다("○○님, 메신저에서 @아이디를 찾아 첫 메시지를 보내주세요"). 화면마다 "누가 누구에게"가 달라지면 안 된다(FR-11.3)\n' +
      '- `action.mattermostUsername` / `action.mattermostLink`: 상대 `@아이디`와 Mattermost 대화창 링크(D-68). 실명은 표시용이다\n' +
      '- 시작자(`myRole=INITIATOR`)에게는 "먼저 메시지를 보내주세요", 상대(`COUNTERPART`)에게는 "○○님이 먼저 연락할 예정입니다"\n' +
      '- 첫 메시지 문안은 만들지 않는다(L5). 소재(공통 관심사, 상대 최근 글)만 준다',
  })
  @ApiParam(CONNECTION_ID)
  connectionDetail(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.connections.connectionDetail(user, id);
  }

  @Post('connections/:id/mark-started')
  @ApiOperation({
    summary: '"메신저에서 메시지를 보냈어요"',
    description:
      '시작자가 첫 메시지를 보냈다고 표시한다. 상대에게 알리지 않는다(docs/07 §3.6). ' +
      '1일 안에 표시하지 않으면 배치(`connection.initiator-remind`)가 재안내한다(FR-11.5).',
  })
  @ApiParam(CONNECTION_ID)
  markStarted(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.connections.markStarted(user, id);
  }

  @Get('follow-ups/pending')
  @ApiOperation({
    summary: '답하지 않은 후속 확인',
    description:
      '성립 P-18(2)일 뒤 배치(`connection.follow-up`)가 "대화를 시작하셨나요?"를 1회 만든다(M14). ' +
      '앱을 열면 이 목록의 첫 항목이 Overlay로 뜬다. 이 응답이 H5(실제 대화)를 재는 **유일한 신호**이며 가드레일 지표(응답 "예" ≥ 50%)의 재료다.',
  })
  pendingFollowUps(@CurrentUser() user: User) {
    return this.followUps.pending(user);
  }

  @Post('follow-ups/:id/respond')
  @ApiOperation({
    summary: '후속 확인 응답',
    description:
      '`started=false`면 사유 1개를 고른다. `reason=NOT_FOUND`(상대를 못 찾음) + `askCounterpart=true`면 ' +
      '상대에게 `CONNECTION_ASK_COUNTERPART` 알림이 간다(docs/09 §10). 이미 답했으면 `409 ALREADY_HANDLED`.',
  })
  @ApiParam({ name: 'id', description: '후속 확인 UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['started'],
      properties: {
        started: { type: 'boolean' },
        reason: { type: 'string', enum: ['NOT_FOUND', 'NO_TIME', 'BURDEN', 'OTHER'], description: 'started=false일 때' },
        askCounterpart: { type: 'boolean', description: 'reason=NOT_FOUND일 때 상대에게 연락을 부탁할지' },
      },
    },
  })
  respondFollowUp(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(followUpResponseSchema))
    body: FollowUpResponseInput,
  ) {
    return this.followUps.respond(user, id, body);
  }
}

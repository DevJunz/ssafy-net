import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import {
  displayNameSchema,
  mattermostSendSchema,
  mattermostVerifySchema,
  type DisplayNameInput,
  type MattermostSendInput,
  type MattermostVerifyInput,
} from '@ssafy-net/shared';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthGuard } from '../auth/auth.guard';
import { NicknameService } from '../users/nickname.service';
import { MattermostVerificationService } from './mattermost-verification.service';
import { OnboardingService } from './onboarding.service';

@ApiTags('온보딩')
@ApiCookieAuth('sn_session')
@Controller('onboarding')
@UseGuards(AuthGuard)
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly nickname: NicknameService,
    private readonly verification: MattermostVerificationService,
  ) {}

  @Get('state')
  @ApiOperation({
    summary: '온보딩 진행 단계',
    description:
      '`{ step: "MATTERMOST" | "DISPLAY_NAME" | "INTERESTS" | "DONE" }`. ' +
      '중단 후 재진입 시 이 값으로 이어서 시작한다(J0 Failure State). ' +
      '온보딩은 3단계다: Mattermost 인증 → 표시명 → 관심사. 알림 설정 단계는 없다(D-67).',
  })
  state(@CurrentUser() user: User) {
    return this.onboarding.state(user);
  }

  /**
   * Mattermost 계정 인증 (D-66). 소속 검증과 알림 채널 확보를 겸한다.
   * 실명도 여기서 함께 받아 DM 본문에 넣는다 — 이름이 틀리면 받는 사람이 알아차린다.
   */
  @Post('mattermost/send')
  @ApiOperation({
    summary: 'Mattermost 인증 코드 발송',
    description:
      '온보딩 1단계(D-66). 입력한 Mattermost 아이디로 6자리 코드를 DM으로 보낸다. ' +
      '계정 보유가 곧 SSAFY 소속 검증이고, 동시에 알림 채널을 확보한다.\n\n' +
      '실명과 반도 여기서 받는다. 반은 1~22반 드롭다운(D-73). DM 본문에 실명이 들어가므로 이름이 틀리면 받는 사람이 알아차린다.\n\n' +
      '`MATTERMOST_DELIVERY_MODE=redirect`(기본)에서는 DM이 운영자 채널로만 간다. ' +
      '운영자 계정(`MATTERMOST_OPERATOR_USERNAME`)은 웹훅 생성자라 DM을 받을 수 없어 인증을 우회한다.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['username', 'realName', 'classNo'],
      properties: {
        username: { type: 'string', example: 'devjunsday', description: 'Mattermost 아이디. 표시명이 아니다. 앞의 @는 있어도 된다' },
        realName: { type: 'string', example: '최준환', maxLength: 20 },
        classNo: { type: 'string', example: '18반', description: '"N반" 형식, 1~22' },
      },
    },
  })
  sendCode(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(mattermostSendSchema)) body: MattermostSendInput,
  ) {
    return this.verification.sendCode(user, body);
  }

  @Post('mattermost/verify')
  @ApiOperation({
    summary: 'Mattermost 인증 코드 확인',
    description:
      'DM으로 받은 6자리 코드를 확인한다. 성공하면 Mattermost 아이디·실명·반이 계정에 고정되고 다음 단계(표시명)로 넘어간다.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['code'],
      properties: { code: { type: 'string', example: '123456', pattern: '^\\d{6}$' } },
    },
  })
  verifyCode(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(mattermostVerifySchema))
    body: MattermostVerifyInput,
  ) {
    return this.verification.verify(user, body.code);
  }

  /** 입력 중 실시간 검사(docs/06 §3.1.3). 중복·실명 유사·부적절 표현. */
  @Get('nickname-check')
  @ApiOperation({
    summary: '닉네임 실시간 검사',
    description:
      '입력 중 호출한다(docs/06 §3.1.3). `{ ok: true }` 또는 `{ ok: false, code }`.\n\n' +
      '거부 코드: `NICKNAME_TAKEN`(중복), `NICKNAME_LOOKS_LIKE_REAL_NAME`(다른 구성원 실명과 일치 또는 한 글자 차이, D-49), ' +
      '`NICKNAME_INVALID`(2~12자 위반·부적절 표현).',
  })
  @ApiQuery({ name: 'value', description: '검사할 닉네임' })
  async checkNickname(
    @CurrentUser() user: User,
    @Query('value') value: string,
  ) {
    const verdict = await this.nickname.check(value ?? '', user.id);
    return verdict.ok
      ? { ok: true }
      : { ok: false, code: verdict.code };
  }

  @Post('display-name')
  @ApiOperation({
    summary: '표시명 설정',
    description:
      '온보딩 2단계. 닉네임 또는 실명 중 하나를 고른다(닉네임/실명 선택제). ' +
      '`type=REAL`이면 `nickname`은 무시하고 null로 둔다. 실명 사용자는 화면에 표시가 붙는다(docs/12 §3). ' +
      '표시명 변경은 하루 1회(`NICKNAME_CHANGE_TOO_SOON`).',
  })
  @ApiBody({
    schema: {
      oneOf: [
        {
          type: 'object',
          required: ['type', 'nickname'],
          properties: {
            type: { type: 'string', enum: ['NICKNAME'] },
            nickname: { type: 'string', minLength: 2, maxLength: 12, example: '달리기왕' },
          },
        },
        {
          type: 'object',
          required: ['type'],
          properties: { type: { type: 'string', enum: ['REAL'] } },
        },
      ],
    },
  })
  setDisplayName(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(displayNameSchema)) body: DisplayNameInput,
  ) {
    return this.onboarding.setDisplayName(user, body);
  }

  /** 관심사를 저장하면 온보딩이 끝난다. 알림 설정 단계는 없앴다(D-67). */
  @Post('complete')
  @ApiOperation({
    summary: '온보딩 완료',
    description:
      '관심사를 `PUT /api/me/interests`로 저장한 뒤 호출한다. 관심사가 최소 개수(P-01) 미만이면 `INTEREST_COUNT_MIN`. ' +
      '성공 시 `status=ACTIVE`, `onboardedAt` 기록. 이때부터 그래프에 들어갈 수 있고 다른 사람에게도 보인다(FR-1.6). ' +
      'Network 후보도 이 시점에 계산된다(docs/10 §2a).',
  })
  complete(@CurrentUser() user: User) {
    return this.onboarding.complete(user);
  }
}

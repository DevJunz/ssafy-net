import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import {
  displayNameSchema,
  identitySchema,
  notificationPrefsSchema,
  profileMessageSchema,
  PROFILE_MESSAGE_MAX,
  type DisplayNameInput,
  type IdentityInput,
  type NotificationPrefsInput,
  type ProfileMessageInput,
} from '@ssafy-net/shared';
import type { Response } from 'express';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AnalyticsService } from '../analytics/analytics.service';
import { AuthGuard, OnboardedGuard } from '../auth/auth.guard';
import { SessionService } from '../auth/session.service';
import { InterestsService } from '../interests/interests.service';
import { UserPresenter } from './user.presenter';
import { UsersService } from './users.service';

@ApiTags('사용자')
@ApiCookieAuth('sn_session')
@Controller()
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly presenter: UserPresenter,
    private readonly interests: InterestsService,
    private readonly users: UsersService,
    private readonly analytics: AnalyticsService,
    private readonly session: SessionService,
  ) {}

  /** 나 자신에게만 나가는 형태. 계정 이메일은 여기에만 있다(docs/12 §1). */
  @Get('me')
  @ApiOperation({
    summary: '내 정보 (SelfUser)',
    description:
      '온보딩 미완료여도 호출할 수 있다. `SelfUser` 형태로 실명·계정 이메일·Mattermost 아이디·온보딩 상태·관심사가 들어 있다. ' +
      '계정 이메일이 응답에 들어가는 유일한 곳이다(docs/12 §1).',
  })
  async me(@CurrentUser() user: User) {
    const interests = await this.interests.refsFor(user.id);
    return this.presenter.toSelfUser(user, interests);
  }

  /** 표시명 변경(닉네임 ↔ 실명, docs/06 §3.10). 입력 중 검사는 온보딩의 `GET /onboarding/nickname-check` 를 그대로 쓴다. */
  @Patch('me/display-name')
  @UseGuards(OnboardedGuard)
  @ApiOperation({
    summary: '표시명 변경 (My Profile)',
    description:
      '온보딩의 `POST /onboarding/display-name` 과 같은 입력이다. `type=REAL` 이면 닉네임을 비운다. ' +
      '하루 1회(`NICKNAME_CHANGE_TOO_SOON`, `details.nextChangeAt`). 온보딩에서 고른 첫 표시명은 변경으로 세지 않는다. ' +
      '같은 값을 다시 보내면 아무것도 바꾸지 않고 200. 바꾸면 진행 중인 요청의 상대와 추천 목록에 새 표시명이 보인다(docs/12 §3). ' +
      '닉네임 규칙은 온보딩과 같다(`NICKNAME_TAKEN` · `NICKNAME_LOOKS_LIKE_REAL_NAME` · `NICKNAME_INVALID`). ' +
      '입력 중 검사는 `GET /onboarding/nickname-check` 를 쓴다. `SelfUser.displayNameChangeableAt` 이 다음 변경 가능 시각이다(지금 되면 null).',
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
    return this.users.setDisplayName(user, body);
  }

  /** 실명 수정(docs/06 §3.10). 온보딩 1단계에서 적은 이름·반을 고친다. */
  @Patch('me/real-name')
  @UseGuards(OnboardedGuard)
  @ApiOperation({
    summary: '실명 수정 (My Profile)',
    description:
      '`{ realName, classNo }`. 캠퍼스는 고정이라 받지 않는다(D-47). 전체 실명은 `이름_서울_N반` 으로 조합된다. ' +
      '연결된 상대에게 보이는 이름이 바뀌고, 실명으로 활동 중이면 표시명도 바로 바뀐다. 하루 1회 규칙은 표시명 선택에만 걸린다(docs/12 §3). ' +
      '같은 값을 보내면 아무것도 바꾸지 않고 200. 응답 `{ realName }` 은 조합된 전체 실명이다. `SelfUser.identity` 가 지금 값.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['realName', 'classNo'],
      properties: {
        realName: { type: 'string', minLength: 1, maxLength: 20, example: '최준환' },
        classNo: { type: 'string', example: '18반', description: '"N반" 형식, 1~22' },
      },
    },
  })
  setRealName(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(identitySchema)) body: IdentityInput,
  ) {
    return this.users.setRealName(user, body);
  }

  /** 프로필 메시지(D-85). 사람 패널에서 표시명 아래에 보이는 한 줄. */
  @Patch('me/profile-message')
  @UseGuards(OnboardedGuard)
  @ApiOperation({
    summary: '프로필 메시지 저장 (My Profile)',
    description:
      `\`{ message }\`. ${PROFILE_MESSAGE_MAX}자까지, 줄바꿈은 한 번까지. 빈 문자열이면 지운다. ` +
      '연결 전에도 누구에게나 보인다 — 사람 패널·받은 요청 상세의 표시명 아래. 금칙어는 닉네임과 같은 목록. ' +
      '응답 `{ profileMessage }`(지웠으면 null). `SelfUser.profileMessage` 가 지금 값.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['message'],
      properties: {
        message: { type: 'string', maxLength: PROFILE_MESSAGE_MAX, example: '러닝 크루 같이 하실 분 찾아요. 주말 아침 한강.' },
      },
    },
  })
  setProfileMessage(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(profileMessageSchema)) body: ProfileMessageInput,
  ) {
    return this.users.setProfileMessage(user, body);
  }

  /** 메신저 알림 받기 설정 (FR-14.2). 앱 내 알림함은 끌 수 없다. */
  @Get('me/notifications')
  @UseGuards(OnboardedGuard)
  @ApiOperation({
    summary: '알림 받기 설정 읽기 (My Profile)',
    description:
      '`{ immediate, digest }`. 메신저(Mattermost) DM 을 받을지다. ' +
      '`immediate` 는 나에게 온 것(연결 요청·수락·네트워크 추천 등), `digest` 는 매일 아침 9시 묶음 알림. ' +
      '**앱 내 알림함은 끌 수 없다** — 채널이 메신저 하나뿐이라 그것이 유일한 대비책이다(D-67).',
  })
  notificationPrefs(@CurrentUser() user: User) {
    return this.users.notificationPrefs(user.id);
  }

  @Patch('me/notifications')
  @UseGuards(OnboardedGuard)
  @ApiOperation({
    summary: '알림 받기 설정 저장 (My Profile)',
    description:
      '`{ immediate?, digest? }` 중 보낸 것만 바꾼다. 응답은 바뀐 뒤의 `{ immediate, digest }`. ' +
      '끄면 그 종류의 메신저 DM 만 멈추고, 알림함에는 그대로 쌓인다.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        immediate: { type: 'boolean', example: true },
        digest: { type: 'boolean', example: false },
      },
    },
  })
  setNotificationPrefs(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(notificationPrefsSchema))
    body: NotificationPrefsInput,
  ) {
    return this.users.setNotificationPrefs(user.id, body);
  }

  /** 탈퇴 (docs/12 §10). 온보딩 중에도 할 수 있어야 하므로 OnboardedGuard 를 걸지 않는다. */
  @Post('me/withdraw')
  @HttpCode(204)
  @ApiOperation({
    summary: '탈퇴',
    description:
      '**되돌릴 수 없다.** 프로필·관심사·글·진행 중인 요청·요청 메시지·후속 확인·알림과 알림 설정을 지우고 ' +
      '계정을 탈퇴 상태로 바꾼다. 성립된 연결과 네트워크는 남아 상대에게 "탈퇴한 사용자" 로 보인다(D-64). ' +
      '로그인 계정을 비우므로 **같은 Google 계정으로 다시 가입할 수 있다** — 옛 데이터는 돌아오지 않는다. ' +
      '마지막 운영자는 탈퇴할 수 없다(400). 세션 쿠키도 함께 지운다.',
  })
  async withdraw(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.users.withdraw(user);
    this.session.clearSession(response);
  }

  @Get('users/:id')
  @UseGuards(OnboardedGuard)
  @ApiOperation({
    summary: '사람 프로필 (Person Profile 패널)',
    description:
      '`PublicUser`(연결 전) 또는 `ConnectedUser`(연결됨, `realName` 포함)를 준다. 소속 정보는 없다.\n\n' +
      '`relation.status`에 따라 화면이 행동 하나만 보여준다(docs/06 §3.4): ' +
      '`NONE` 연결 요청 · `REQUEST_SENT` 응답 대기+취소 · `REQUEST_RECEIVED` 수락/거절 · ' +
      '`CONNECTED` 성립 화면 열기 · `NO_RESPONSE` 응답 없음(바로 다시 요청 가능) · `REJECTED` 거절됨(바로 다시 요청 가능, D-83) · `SELF` 관심사 수정.\n\n' +
      '관심사 전부를 주므로 프론트가 Person Focus의 임시 노드를 그래프에 얹는다(서버 왕복 없음).',
  })
  @ApiParam({ name: 'id', description: '사용자 UUID' })
  async profile(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) targetId: string,
  ) {
    const profile = await this.users.profile(user, targetId);
    // 프로필 열람은 요청 전환율의 분모다(docs/14 §2.3). 서버가 남긴다.
    if (targetId !== user.id) {
      this.analytics.track('profile.view', user.id, {
        targetId,
        relation: profile.relation?.status ?? null,
        commonCount: profile.commonCount ?? null,
      });
    }
    return profile;
  }
}

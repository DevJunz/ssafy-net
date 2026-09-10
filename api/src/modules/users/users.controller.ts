import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { AnalyticsService } from '../analytics/analytics.service';
import { AuthGuard, OnboardedGuard } from '../auth/auth.guard';
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

  @Get('users/:id')
  @UseGuards(OnboardedGuard)
  @ApiOperation({
    summary: '사람 프로필 (Person Profile 패널)',
    description:
      '`PublicUser`(연결 전) 또는 `ConnectedUser`(연결됨, `realName` 포함)를 준다. 소속 정보는 없다.\n\n' +
      '`relation.status`에 따라 화면이 행동 하나만 보여준다(docs/06 §3.4): ' +
      '`NONE` 연결 요청 · `REQUEST_SENT` 응답 대기+취소 · `REQUEST_RECEIVED` 수락/거절 · ' +
      '`CONNECTED` 성립 화면 열기 · `NO_RESPONSE` N일 후 재요청 가능 · `SELF` 관심사 수정.\n\n' +
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

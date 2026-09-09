import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthGuard, OnboardedGuard } from '../auth/auth.guard';
import { RecommendationService } from './recommendation.service';

@ApiTags('추천')
@ApiCookieAuth('sn_session')
@Controller('recommendations')
@UseGuards(AuthGuard, OnboardedGuard)
export class RecommendationController {
  constructor(private readonly recommendation: RecommendationService) {}

  @Get('similar-people')
  @ApiOperation({
    summary: 'Similar People 목록',
    description:
      '공통 관심사 P-03(3)개 이상인 사람. 정렬: 공통 개수 → 희소성(동점만, `ln(1 + 온보딩완료자/보유자)`, D-63) → 최근 가입. 층은 공통 계산에서 뺀다(D-72).\n\n' +
      '응답 `{ criterion: { minCommon, sortBy }, total, items: [{ user, commonInterests, commonCount, inGraph }], hiddenCount }`.\n\n' +
      '- `criterion.sortBy`는 서버가 문장으로 준다. 화면 상단에 그대로 쓴다(docs/13 원칙 4)\n' +
      '- 공통 관심사 **이름 전부**를 준다. 점수·퍼센트는 없다(docs/13 원칙 2·3)\n' +
      '- 이미 연결·요청 중인 사람도 남는다(`relation`으로 구분). 내가 거절한 사람은 숨기고 `hiddenCount`로 개수만 알린다\n' +
      '- 정지·온보딩 미완료·탈퇴자 제외',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    enum: ['all', 'new_only'],
    description: 'new_only면 아직 관계가 없는 사람만',
  })
  similarPeople(
    @CurrentUser() user: User,
    @Query('filter') filter: string | undefined,
  ) {
    return this.recommendation.similarPeople(user, {
      newOnly: filter === 'new_only',
    });
  }
}

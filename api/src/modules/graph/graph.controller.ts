import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthGuard, OnboardedGuard } from '../auth/auth.guard';
import { GraphService } from './graph.service';

@ApiTags('그래프')
@ApiCookieAuth('sn_session')
@Controller('graph')
@UseGuards(AuthGuard, OnboardedGuard)
export class GraphController {
  constructor(private readonly graph: GraphService) {}

  @Get()
  @ApiOperation({
    summary: '그래프 (나 중심 / 관심사 중심)',
    description:
      '홈 화면의 그래프. 전체 그래프는 없다(docs/06 §1.1).\n\n' +
      '- `anchor=me`(기본): 나 + 내 관심사 전부 + 사람 P-13(30)명(관심사당 최소 2명 보정) + 인접 관심사 P-14(8)개\n' +
      '- `anchor=interest&interestId=`: 그 관심사 + 보유자 30명 + 그들의 다른 관심사 8개. 나는 항상 남는다\n\n' +
      '응답 `{ anchor, nodes, links, truncated }`. 노드 종류 `ME | PERSON | INTEREST | NETWORK_HUB`, ' +
      '선 종류 `HAS_INTEREST | SIMILARITY | HUB_MEMBER`. `adjacent: true`가 인접 관심사. ' +
      '`truncated`는 항상 있다("N명 더 있음"). 점수·유사도·좌표 없음 — 배치는 클라이언트 힘 기반 레이아웃(D-51, docs/07 §2.15). ' +
      '표시 상한 때문에 응답 크기는 인원수와 무관하다(1,006명 실측 19ms).',
  })
  @ApiQuery({ name: 'anchor', required: false, enum: ['me', 'interest'], description: '기본 me' })
  @ApiQuery({ name: 'interestId', required: false, description: 'anchor=interest일 때 필수. 관심사 UUID' })
  async get(
    @CurrentUser() user: User,
    @Query('anchor') anchor: string | undefined,
    @Query('interestId') interestId: string | undefined,
  ) {
    if (anchor === 'interest') {
      if (!interestId) throw new AppError('VALIDATION_FAILED');
      return this.graph.interestAnchored(user, interestId);
    }
    return this.graph.meAnchored(user);
  }

  /** Similar 모드. 기본 그래프 위에 겹쳐질 나–사람 선만 돌려준다. */
  @Get('similar')
  @ApiOperation({
    summary: 'Similar 모드 (나–사람 유사도 선)',
    description:
      '"나와 비슷한 사람 보기". 기본 그래프 위에 겹칠 나 + 상위 P-15(10)명 + `SIMILARITY` 선만 준다. ' +
      '각 선에 `commonCount`와 공통 관심사 id 전부(hover에 이름 전부, FR-8.2). 목록 전체는 `GET /api/recommendations/similar-people`.',
  })
  similar(@CurrentUser() user: User) {
    return this.graph.similarMode(user);
  }
}

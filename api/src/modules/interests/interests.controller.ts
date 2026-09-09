import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
  createInterestSchema,
  interestSelectionSchema,
  type CreateInterestInput,
  type InterestSelectionInput,
} from '@ssafy-net/shared';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthGuard, OnboardedGuard } from '../auth/auth.guard';
import { InterestsService } from './interests.service';

@ApiTags('관심사')
@ApiCookieAuth('sn_session')
@Controller()
@UseGuards(AuthGuard)
export class InterestsController {
  constructor(private readonly interests: InterestsService) {}

  /** 온보딩과 My Profile 관심사 수정이 같은 화면·같은 응답을 쓴다(D-24). */
  @Get('interests')
  @ApiOperation({
    summary: '관심사 전체 목록 (분류별)',
    description:
      '온보딩 미완료여도 호출할 수 있다. 온보딩과 My Profile 관심사 수정이 같은 응답을 쓴다(D-24).\n\n' +
      '`{ categories: [{ id, name, kind, interests: [{ id, name, aliases, holderCount, mine, status }] }], selectedCount, min, max }`\n\n' +
      '- `kind=INTEREST` 분류 10개(100개 확정본, D-71). `kind=ATTRIBUTE`는 층(1~20층, D-72)이며 분류당 하나만 고른다\n' +
      '- `selectedCount`와 min/max(P-01=5, P-02=15) 판정은 INTEREST 분류만 센다\n' +
      '- `aliases`는 검색이 별칭에도 걸리게 하는 용도("리액트" → React)\n' +
      '- `status=HIDDEN`은 이미 가진 사람에게만 보인다(docs/08 §5)\n' +
      '- 사람 이름은 없다. 사람 이름 검색은 만들지 않는다(L3)',
  })
  catalog(@CurrentUser() user: User) {
    return this.interests.catalog(user.id);
  }

  /**
   * 관심사 직접 추가 전 중복 검사 (D-74).
   * `interests/:id`보다 앞에 둔다 — 뒤에 두면 "similar"가 id로 해석된다.
   */
  @Get('interests/similar')
  @ApiOperation({
    summary: '비슷한 기존 관심사 검색 (직접 추가 전 검사)',
    description:
      '관심사를 직접 추가하기 전에 같은 뜻·비슷한 것이 있는지 본다(D-74). 온보딩 중에도 호출할 수 있다.\n\n' +
      '응답: `[{ id, name, categoryId, categoryName, holderCount, match: "EXACT" | "SIMILAR" }]` 최대 5개.\n\n' +
      '판정 순서: 정규화(공백·기호·대소문자 무시) 완전 일치 → 포함 관계 → 자모 단위 bigram Dice / 편집 거리. 이름과 별칭을 모두 본다.',
  })
  @ApiQuery({ name: 'q', description: '입력 중인 관심사 이름', example: '리엑트' })
  similar(@Query('q') q: string | undefined) {
    return this.interests.similar(q ?? '');
  }

  /**
   * 관심사 직접 추가 (D-74). 온보딩 중에도 쓸 수 있다.
   * 같은 뜻이 있으면 INTEREST_EXISTS, 비슷한 것이 있으면 INTEREST_SIMILAR로 멈추고
   * details.similar를 준다. 화면이 확인을 받은 뒤 confirmSimilar로 다시 보낸다.
   */
  @Post('interests')
  @ApiOperation({
    summary: '관심사 직접 추가',
    description:
      '운영자 검토(제안 S4)를 없애고 사용자가 바로 만든다(D-74). 만들어지면 즉시 목록에 오르고 운영자 채널에 한 줄 남는다.\n\n' +
      '| 상황 | 응답 |\n|---|---|\n' +
      '| 같은 뜻이 이미 있음 | `409 INTEREST_EXISTS` + `details.interest`. 확인해도 만들 수 없다 |\n' +
      '| 비슷한 것이 있음, `confirmSimilar` 없음 | `409 INTEREST_SIMILAR` + `details.similar[]`. 화면이 보여주고 확인을 받아 다시 보낸다 |\n' +
      '| 오늘 3개 넘게 만듦 | `429 INTEREST_CREATE_LIMIT` |\n' +
      '| 속성 분류(층)에 추가 | `400 INTEREST_CATEGORY_INVALID` |\n' +
      '| 성공 | `201 { id, name, categoryId, aliases: [], holderCount: 0 }` |\n\n' +
      '**만든 사람의 선택에는 넣지 않는다.** 화면이 고른 뒤 `PUT /api/me/interests`로 저장한다.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'categoryId'],
      properties: {
        name: { type: 'string', maxLength: 20, example: '러스트', description: '한글·영문·숫자와 일부 기호( .+#·/&-)' },
        categoryId: { type: 'string', format: 'uuid', description: 'kind=INTEREST인 분류' },
        confirmSimilar: { type: 'boolean', description: '비슷한 것이 있다는 안내를 보고도 추가하겠다는 확인' },
      },
    },
  })
  create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(createInterestSchema)) body: CreateInterestInput,
  ) {
    return this.interests.create(user, body);
  }

  @Get('interests/:id')
  @UseGuards(OnboardedGuard)
  @ApiOperation({
    summary: '관심사 상세 (Interest 패널)',
    description:
      '이름, 분류, `holderCount`, `mine`, `peopleTotal`, 상위 사람 20명(나와 공통 많은 순), 최근 글 5개, ' +
      '`canPost`(내가 이 관심사를 가졌는가, FR-6.1). 층(ATTRIBUTE)에는 글이 붙지 않는다(D-72).',
  })
  @ApiParam({ name: 'id', description: '관심사 UUID' })
  detail(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) interestId: string,
  ) {
    return this.interests.detail(user, interestId);
  }

  @Get('interests/:id/people')
  @UseGuards(OnboardedGuard)
  @ApiOperation({
    summary: '관심사 보유자 목록',
    description:
      '이 관심사를 가진 사람을 나와 공통 관심사가 많은 순으로 준다. `offset`으로 이어서 본다. ' +
      '온보딩 미완료·정지·탈퇴자는 빠진다. 각 항목은 `PublicUser`(실명 없음).',
  })
  @ApiParam({ name: 'id', description: '관심사 UUID' })
  @ApiQuery({ name: 'offset', required: false, description: '건너뛸 개수. 기본 0' })
  people(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) interestId: string,
    @Query('offset') offset: string | undefined,
  ) {
    return this.interests.people(user, interestId, Number(offset ?? 0) || 0);
  }

  @Put('me/interests')
  @ApiOperation({
    summary: '내 관심사 저장 (전체 교체)',
    description:
      '온보딩 3단계와 My Profile 수정이 같은 엔드포인트를 쓴다(D-24). 온보딩 미완료여도 호출할 수 있다.\n\n' +
      '- INTEREST 분류만 세어 P-01(5) 이상 P-02(15) 이하. 위반 시 `INTEREST_COUNT_MIN` / `INTEREST_COUNT_MAX`\n' +
      '- ATTRIBUTE 분류(층)는 분류당 하나만. 위반 시 `INTEREST_ATTRIBUTE_SINGLE`\n' +
      '- 저장 시 `UserInterestChange` 기록, `holderCount` 갱신. 그래프와 추천이 즉시 달라진다(NFR-5). 응답에 `notice` 문구가 있다',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['interestIds'],
      properties: {
        interestIds: { type: 'array', maxItems: 50, items: { type: 'string', format: 'uuid' } },
      },
    },
  })
  async replace(
    @CurrentUser() user: User,
    // 파이프는 @Body에만 붙인다. @UsePipes로 걸면 @CurrentUser 인자까지 검증 대상이 된다.
    @Body(new ZodValidationPipe(interestSelectionSchema))
    body: InterestSelectionInput,
  ) {
    const interests = await this.interests.replace(user.id, body.interestIds);
    return {
      interests,
      // 저장하면 그래프와 추천이 즉시 달라진다(NFR-5, docs/07 §5).
      notice: '그래프와 추천이 바뀌었습니다.',
    };
  }

  @Post('me/interests/:id')
  @ApiOperation({
    summary: '내 관심사에 하나 추가',
    description:
      'Interest 패널의 "내 관심사에 추가" 버튼(docs/06 §3.3). 개수 상한과 층 단일 규칙은 전체 교체와 같다.',
  })
  @ApiParam({ name: 'id', description: '관심사 UUID' })
  addOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) interestId: string,
  ) {
    return this.interests.addOne(user.id, interestId);
  }

  @Delete('me/interests/:id')
  @ApiOperation({
    summary: '내 관심사에서 하나 제거',
    description: '최소 개수(P-01) 아래로 내려가면 `INTEREST_COUNT_MIN`.',
  })
  @ApiParam({ name: 'id', description: '관심사 UUID' })
  removeOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) interestId: string,
  ) {
    return this.interests.removeOne(user.id, interestId);
  }
}

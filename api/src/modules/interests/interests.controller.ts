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
import type { User } from '@prisma/client';
import {
  interestSelectionSchema,
  suggestionSchema,
  type InterestSelectionInput,
  type SuggestionInput,
} from '@ssafy-net/shared';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthGuard, OnboardedGuard } from '../auth/auth.guard';
import { InterestsService } from './interests.service';
import { SuggestionsService } from './suggestions.service';

@Controller()
@UseGuards(AuthGuard)
export class InterestsController {
  constructor(
    private readonly interests: InterestsService,
    private readonly suggestions: SuggestionsService,
  ) {}

  /** 온보딩과 My Profile 관심사 수정이 같은 화면·같은 응답을 쓴다(D-24). */
  @Get('interests')
  catalog(@CurrentUser() user: User) {
    return this.interests.catalog(user.id);
  }

  /**
   * 관심사 제안 (S4). 사용자가 직접 만들지는 못한다 —
   * 자유 입력은 같은 뜻이 흩어져 공통 관심사 계산을 망친다(docs/08 §1).
   */
  @Get('interest-suggestions/similar')
  similarInterests(@Query('q') q: string | undefined) {
    return this.suggestions.similar(q ?? '');
  }

  @Post('interest-suggestions')
  suggest(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(suggestionSchema)) body: SuggestionInput,
  ) {
    return this.suggestions.create(user, body);
  }

  @Get('interests/:id')
  @UseGuards(OnboardedGuard)
  detail(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) interestId: string,
  ) {
    return this.interests.detail(user, interestId);
  }

  @Get('interests/:id/people')
  @UseGuards(OnboardedGuard)
  people(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) interestId: string,
    @Query('offset') offset: string | undefined,
  ) {
    return this.interests.people(user, interestId, Number(offset ?? 0) || 0);
  }

  @Put('me/interests')
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
  addOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) interestId: string,
  ) {
    return this.interests.addOne(user.id, interestId);
  }

  @Delete('me/interests/:id')
  removeOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) interestId: string,
  ) {
    return this.interests.removeOne(user.id, interestId);
  }
}

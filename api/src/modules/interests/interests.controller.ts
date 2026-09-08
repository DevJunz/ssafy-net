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
  createInterestSchema,
  interestSelectionSchema,
  type CreateInterestInput,
  type InterestSelectionInput,
} from '@ssafy-net/shared';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthGuard, OnboardedGuard } from '../auth/auth.guard';
import { InterestsService } from './interests.service';

@Controller()
@UseGuards(AuthGuard)
export class InterestsController {
  constructor(private readonly interests: InterestsService) {}

  /** 온보딩과 My Profile 관심사 수정이 같은 화면·같은 응답을 쓴다(D-24). */
  @Get('interests')
  catalog(@CurrentUser() user: User) {
    return this.interests.catalog(user.id);
  }

  /**
   * 관심사 직접 추가 전 중복 검사 (D-74).
   * `interests/:id`보다 앞에 둔다 — 뒤에 두면 "similar"가 id로 해석된다.
   */
  @Get('interests/similar')
  similar(@Query('q') q: string | undefined) {
    return this.interests.similar(q ?? '');
  }

  /**
   * 관심사 직접 추가 (D-74). 온보딩 중에도 쓸 수 있다.
   * 같은 뜻이 있으면 INTEREST_EXISTS, 비슷한 것이 있으면 INTEREST_SIMILAR로 멈추고
   * details.similar를 준다. 화면이 확인을 받은 뒤 confirmSimilar로 다시 보낸다.
   */
  @Post('interests')
  create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(createInterestSchema)) body: CreateInterestInput,
  ) {
    return this.interests.create(user, body);
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

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import {
  interestSelectionSchema,
  type InterestSelectionInput,
} from '@ssafy-net/shared';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthGuard } from '../auth/auth.guard';
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

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { postSchema, type PostInput } from '@ssafy-net/shared';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthGuard, OnboardedGuard } from '../auth/auth.guard';
import { PostsService } from './posts.service';

@ApiTags('Interest Post')
@ApiCookieAuth('sn_session')
@Controller()
@UseGuards(AuthGuard, OnboardedGuard)
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post('posts')
  @ApiOperation({
    summary: '관심사 글 작성 (S1)',
    description:
      '글은 커뮤니티가 아니라 연결 요청의 재료다(docs/11). 댓글·좋아요·피드·검색은 없다. 출구는 연결 요청뿐.\n\n' +
      '- 그 관심사 보유자만 → 아니면 `403 POST_INTEREST_NOT_OWNED`\n' +
      '- 층(ATTRIBUTE)에는 글을 붙일 수 없다(D-72)\n' +
      '- 1~300자(P-17), 관심사 하나\n' +
      '- 관심사당 하루 1개, 전체 하루 3개 → `429 POST_LIMIT_REACHED`\n' +
      '- 수정 없음. 만료 없음',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['interestId', 'content'],
      properties: {
        interestId: { type: 'string', format: 'uuid' },
        content: { type: 'string', minLength: 1, maxLength: 300, example: '주말 아침 한강 러닝 같이 하실 분 있나요?' },
      },
    },
  })
  create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(postSchema)) body: PostInput,
  ) {
    return this.posts.create(user, body);
  }

  @Delete('posts/:id')
  @ApiOperation({ summary: '글 삭제', description: '작성자 본인만. 운영자 삭제는 별도 엔드포인트 없이 SQL로 한다.' })
  @ApiParam({ name: 'id', description: '글 UUID' })
  remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.posts.remove(user, id);
  }

  @Get('me/posts')
  @ApiOperation({ summary: '내가 쓴 글', description: 'My Profile 화면. 최신순.' })
  mine(@CurrentUser() user: User) {
    return this.posts.mine(user);
  }

  @Get('users/:id/posts')
  @ApiOperation({
    summary: '그 사람의 글',
    description: 'Person Profile 패널에 최근 3개. 연결 성립 화면에서는 첫 메시지 소재로 보여준다.',
  })
  @ApiParam({ name: 'id', description: '사용자 UUID' })
  byAuthor(@Param('id', ParseUUIDPipe) id: string) {
    return this.posts.byAuthor(id);
  }
}

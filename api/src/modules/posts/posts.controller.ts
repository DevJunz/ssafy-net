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
import type { User } from '@prisma/client';
import { postSchema, type PostInput } from '@ssafy-net/shared';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthGuard, OnboardedGuard } from '../auth/auth.guard';
import { PostsService } from './posts.service';

@Controller()
@UseGuards(AuthGuard, OnboardedGuard)
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post('posts')
  create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(postSchema)) body: PostInput,
  ) {
    return this.posts.create(user, body);
  }

  @Delete('posts/:id')
  remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.posts.remove(user, id);
  }

  @Get('me/posts')
  mine(@CurrentUser() user: User) {
    return this.posts.mine(user);
  }

  @Get('users/:id/posts')
  byAuthor(@Param('id', ParseUUIDPipe) id: string) {
    return this.posts.byAuthor(id);
  }
}

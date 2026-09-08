import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthGuard, OnboardedGuard } from '../auth/auth.guard';
import { GraphService } from './graph.service';

@Controller('graph')
@UseGuards(AuthGuard, OnboardedGuard)
export class GraphController {
  constructor(private readonly graph: GraphService) {}

  @Get()
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
  similar(@CurrentUser() user: User) {
    return this.graph.similarMode(user);
  }
}

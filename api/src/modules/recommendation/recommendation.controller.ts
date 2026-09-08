import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthGuard, OnboardedGuard } from '../auth/auth.guard';
import { RecommendationService } from './recommendation.service';

@Controller('recommendations')
@UseGuards(AuthGuard, OnboardedGuard)
export class RecommendationController {
  constructor(private readonly recommendation: RecommendationService) {}

  @Get('similar-people')
  similarPeople(
    @CurrentUser() user: User,
    @Query('filter') filter: string | undefined,
  ) {
    return this.recommendation.similarPeople(user, {
      newOnly: filter === 'new_only',
    });
  }
}

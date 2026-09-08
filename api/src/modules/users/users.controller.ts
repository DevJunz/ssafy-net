import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthGuard, OnboardedGuard } from '../auth/auth.guard';
import { InterestsService } from '../interests/interests.service';
import { UserPresenter } from './user.presenter';
import { UsersService } from './users.service';

@Controller()
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly presenter: UserPresenter,
    private readonly interests: InterestsService,
    private readonly users: UsersService,
  ) {}

  /** 나 자신에게만 나가는 형태. 계정 이메일은 여기에만 있다(docs/12 §1). */
  @Get('me')
  async me(@CurrentUser() user: User) {
    const interests = await this.interests.refsFor(user.id);
    return this.presenter.toSelfUser(user, interests);
  }

  @Get('users/:id')
  @UseGuards(OnboardedGuard)
  profile(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) targetId: string,
  ) {
    return this.users.profile(user, targetId);
  }
}

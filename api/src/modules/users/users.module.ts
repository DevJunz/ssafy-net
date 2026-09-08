import { Module } from '@nestjs/common';
import { InterestsModule } from '../interests/interests.module';
import { NicknameService } from './nickname.service';
import { UserPresenter } from './user.presenter';
import { UsersController } from './users.controller';

@Module({
  imports: [InterestsModule],
  controllers: [UsersController],
  providers: [UserPresenter, NicknameService],
  exports: [UserPresenter, NicknameService],
})
export class UsersModule {}

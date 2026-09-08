import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { InterestsModule } from '../interests/interests.module';
import { PostsModule } from '../posts/posts.module';
import { NicknameService } from './nickname.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [InterestsModule, ConnectionsModule, PostsModule],
  controllers: [UsersController],
  providers: [NicknameService, UsersService],
  exports: [NicknameService],
})
export class UsersModule {}

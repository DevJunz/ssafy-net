import { Module } from '@nestjs/common';
import { MattermostModule } from '../../infra/mattermost/mattermost.module';
import { ConnectionsModule } from '../connections/connections.module';
import { PostsModule } from '../posts/posts.module';
import { CommonInterestsModule } from '../recommendation/common-interests.module';
import { CategoriesAdminController } from './categories-admin.controller';
import { CategoriesService } from './categories.service';
import { InterestsController } from './interests.controller';
import { InterestsService } from './interests.service';

@Module({
  imports: [CommonInterestsModule, ConnectionsModule, PostsModule, MattermostModule],
  controllers: [InterestsController, CategoriesAdminController],
  providers: [InterestsService, CategoriesService],
  exports: [InterestsService],
})
export class InterestsModule {}

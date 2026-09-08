import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PostsModule } from '../posts/posts.module';
import { CommonInterestsModule } from '../recommendation/common-interests.module';
import { InterestsController } from './interests.controller';
import { InterestsService } from './interests.service';
import { SuggestionsAdminController } from './suggestions.admin.controller';
import { SuggestionsService } from './suggestions.service';

@Module({
  imports: [CommonInterestsModule, ConnectionsModule, PostsModule, NotificationsModule],
  controllers: [InterestsController, SuggestionsAdminController],
  providers: [InterestsService, SuggestionsService],
  exports: [InterestsService],
})
export class InterestsModule {}

import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { FollowUpService } from './follow-up.service';
import { RelationService } from './relation.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ConnectionsController],
  providers: [RelationService, ConnectionsService, FollowUpService],
  exports: [RelationService, FollowUpService],
})
export class ConnectionsModule {}

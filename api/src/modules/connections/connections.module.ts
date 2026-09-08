import { Module } from '@nestjs/common';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { FollowUpService } from './follow-up.service';
import { QuotaService } from './quota.service';
import { RelationService } from './relation.service';

@Module({
  controllers: [ConnectionsController],
  providers: [RelationService, QuotaService, ConnectionsService, FollowUpService],
  exports: [RelationService, FollowUpService],
})
export class ConnectionsModule {}

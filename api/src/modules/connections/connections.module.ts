import { Module } from '@nestjs/common';
import { RelationService } from './relation.service';

@Module({
  providers: [RelationService],
  exports: [RelationService],
})
export class ConnectionsModule {}

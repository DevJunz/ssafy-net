import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { CommonInterestsModule } from '../recommendation/common-interests.module';
import { GraphController } from './graph.controller';
import { GraphService } from './graph.service';

@Module({
  imports: [CommonInterestsModule, ConnectionsModule],
  controllers: [GraphController],
  providers: [GraphService],
})
export class GraphModule {}

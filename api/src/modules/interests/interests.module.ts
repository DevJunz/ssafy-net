import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { CommonInterestsModule } from '../recommendation/common-interests.module';
import { InterestsController } from './interests.controller';
import { InterestsService } from './interests.service';

@Module({
  imports: [CommonInterestsModule, ConnectionsModule],
  controllers: [InterestsController],
  providers: [InterestsService],
  exports: [InterestsService],
})
export class InterestsModule {}

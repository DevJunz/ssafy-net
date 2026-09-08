import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { CommonInterestsModule } from './common-interests.module';
import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';

@Module({
  imports: [CommonInterestsModule, ConnectionsModule],
  controllers: [RecommendationController],
  providers: [RecommendationService],
  exports: [RecommendationService],
})
export class RecommendationModule {}

import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { QuestionsModule } from '../questions/questions.module';
import { CandidateService } from './candidate.service';
import { ExposureService } from './exposure.service';
import { NetworksAdminController, NetworksController } from './networks.controller';
import { NetworksService } from './networks.service';

@Module({
  imports: [NotificationsModule, QuestionsModule],
  controllers: [NetworksController, NetworksAdminController],
  providers: [CandidateService, ExposureService, NetworksService],
  exports: [CandidateService, ExposureService],
})
export class NetworksModule {}

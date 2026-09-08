import { Module } from '@nestjs/common';
import { CandidateService } from './candidate.service';
import { ExposureService } from './exposure.service';
import { NetworksAdminController, NetworksController } from './networks.controller';
import { NetworksService } from './networks.service';

@Module({
  controllers: [NetworksController, NetworksAdminController],
  providers: [CandidateService, ExposureService, NetworksService],
  exports: [CandidateService, ExposureService],
})
export class NetworksModule {}

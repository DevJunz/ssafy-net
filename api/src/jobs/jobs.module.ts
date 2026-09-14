import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../modules/connections/connections.module';
import { NetworksModule } from '../modules/networks/networks.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { JobScheduleService } from './job-schedule.service';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

/**
 * 배치 11종. `runNow` 는 운영자 화면의 Network 스위치도 쓴다(OpsModule, D-78).
 * 시각이 정해진 둘(묶음 알림·네트워크 재계산)의 스위치와 시각은 `JobScheduleService` 가 갖는다(D-96).
 */
@Module({
  imports: [ConnectionsModule, NetworksModule, NotificationsModule],
  controllers: [JobsController],
  providers: [JobsService, JobScheduleService],
  exports: [JobsService, JobScheduleService],
})
export class JobsModule {}

import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../modules/connections/connections.module';
import { NetworksModule } from '../modules/networks/networks.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

/** 배치 10종. `runNow` 는 운영자 화면의 Network 스위치도 쓴다(OpsModule, D-78). */
@Module({
  imports: [ConnectionsModule, NetworksModule, NotificationsModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}

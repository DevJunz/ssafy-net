import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../modules/connections/connections.module';
import { NetworksModule } from '../modules/networks/networks.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [ConnectionsModule, NetworksModule, NotificationsModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}

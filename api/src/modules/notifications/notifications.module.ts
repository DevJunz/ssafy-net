import { Module } from '@nestjs/common';
import {
  NotificationRedirectController,
  NotificationsController,
} from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController, NotificationRedirectController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

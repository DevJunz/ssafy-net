import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AnalyticsService } from './analytics.service';
import { EventsController } from './events.controller';

/** 전역이다. 컨트롤러 어디서든 `AnalyticsService.track` 을 부른다(design/20 §10). */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [EventsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}

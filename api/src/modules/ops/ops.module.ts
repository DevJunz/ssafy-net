import { Module } from '@nestjs/common';
import { MattermostModule } from '../../infra/mattermost/mattermost.module';
import { JobsModule } from '../../jobs/jobs.module';
import { AuthModule } from '../auth/auth.module';
import { NetworksModule } from '../networks/networks.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ParametersModule } from '../parameters/parameters.module';
import { PresenterModule } from '../users/presenter.module';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

/**
 * 운영자 화면 (D-77). 지표를 읽고, 레버 둘을 당긴다 —
 * Network 스위치(D-78: 플래그 + 배치 즉시 실행 + 시작 안내 알림)와 운영자 추가·해제(D-79).
 */
@Module({
  imports: [
    AuthModule,
    ParametersModule,
    PresenterModule,
    MattermostModule,
    NetworksModule,
    NotificationsModule,
    JobsModule,
  ],
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}

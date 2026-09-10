import { Module } from '@nestjs/common';
import { MattermostModule } from '../../infra/mattermost/mattermost.module';
import { AuthModule } from '../auth/auth.module';
import { ParametersModule } from '../parameters/parameters.module';
import { PresenterModule } from '../users/presenter.module';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

/** 운영자 대시보드 (D-77). 읽기만 한다. */
@Module({
  imports: [AuthModule, ParametersModule, PresenterModule, MattermostModule],
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}

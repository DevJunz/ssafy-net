import { Global, Module } from '@nestjs/common';
import { MattermostService } from './mattermost.service';

/** 발송기는 알림·온보딩 양쪽이 쓴다. 의존이 설정뿐이라 전역으로 둔다. */
@Global()
@Module({
  providers: [MattermostService],
  exports: [MattermostService],
})
export class MattermostModule {}

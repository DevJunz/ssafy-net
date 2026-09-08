import { Global, Module } from '@nestjs/common';
import { UserPresenter } from './user.presenter';

/**
 * 공개 범위 직렬화는 거의 모든 모듈이 쓴다(design/20 §11).
 * 의존이 없는 순수 변환기라 전역으로 두고, 모듈 간 순환 의존을 만들지 않는다.
 */
@Global()
@Module({
  providers: [UserPresenter],
  exports: [UserPresenter],
})
export class PresenterModule {}

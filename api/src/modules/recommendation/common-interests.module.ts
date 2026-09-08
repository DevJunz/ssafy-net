import { Module } from '@nestjs/common';
import { CommonInterestsService } from './common-interests.service';

/**
 * 그래프와 추천, 관심사 상세가 모두 같은 집계를 쓴다.
 * 의존이 Prisma뿐이라 따로 떼어 순환 의존을 피한다.
 */
@Module({
  providers: [CommonInterestsService],
  exports: [CommonInterestsService],
})
export class CommonInterestsModule {}

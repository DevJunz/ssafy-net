import { Module } from '@nestjs/common';
import { QuestionsAdminController } from './questions-admin.controller';
import { QuestionsService } from './questions.service';

/** 네트워킹 질문 (D-87). NetworksModule 이 성립 화면과 성립 알림에 쓴다. */
@Module({
  controllers: [QuestionsAdminController],
  providers: [QuestionsService],
  exports: [QuestionsService],
})
export class QuestionsModule {}

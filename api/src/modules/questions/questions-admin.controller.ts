import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  createQuestionSchema,
  QUESTION_TEXT_MAX,
  updateQuestionSchema,
  type CreateQuestionInput,
  type UpdateQuestionInput,
} from '@ssafy-net/shared';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthGuard, OnboardedGuard, OperatorGuard } from '../auth/auth.guard';
import { QuestionsService } from './questions.service';

const QUESTION_BODY = {
  schema: {
    type: 'object',
    required: ['text'],
    properties: { text: { type: 'string', maxLength: QUESTION_TEXT_MAX, example: '요즘 가장 몰입해 있는 것은 무엇인가요?' } },
  },
};

const QUESTION_PATCH_BODY = {
  schema: {
    type: 'object',
    properties: {
      text: { type: 'string', maxLength: QUESTION_TEXT_MAX },
      sortOrder: { type: 'integer', minimum: 0 },
      active: { type: 'boolean', description: '포괄 질문에만. 끄면 새로 성립하는 네트워크에 뽑히지 않는다' },
    },
  },
};

/**
 * 네트워킹 질문 관리 (D-87). 운영자만.
 * 주제별 질문(`/interests/...`)과 포괄 아이스브레이킹(`/icebreakers`). 응답에 사용자는 없다.
 */
@ApiTags('운영자')
@ApiCookieAuth('sn_session')
@Controller('admin/questions')
@UseGuards(AuthGuard, OnboardedGuard, OperatorGuard)
export class QuestionsAdminController {
  constructor(private readonly questions: QuestionsService) {}

  @Get('interests')
  @ApiOperation({
    summary: '관심사별 질문 수 (D-87)',
    description: '이야깃거리(INTEREST) 분류의 활성 관심사 전부와 각각의 질문 수. 층 같은 속성에는 질문을 두지 않는다.',
  })
  summaries() {
    return this.questions.interestSummaries();
  }

  @Get('interests/:interestId')
  @ApiOperation({ summary: '한 관심사의 질문 목록 (D-87)' })
  @ApiParam({ name: 'interestId', description: '관심사 UUID' })
  listForInterest(@Param('interestId', ParseUUIDPipe) interestId: string) {
    return this.questions.listForInterest(interestId);
  }

  @Post('interests/:interestId')
  @ApiOperation({ summary: '관심사에 질문 추가 (D-87)', description: '맨 뒤에 붙는다.' })
  @ApiParam({ name: 'interestId', description: '관심사 UUID' })
  @ApiBody(QUESTION_BODY)
  createForInterest(
    @Param('interestId', ParseUUIDPipe) interestId: string,
    @Body(new ZodValidationPipe(createQuestionSchema)) body: CreateQuestionInput,
  ) {
    return this.questions.createForInterest(interestId, body);
  }

  @Patch('interest-questions/:id')
  @ApiOperation({ summary: '주제별 질문 수정 (D-87)', description: '본문과 순서.' })
  @ApiParam({ name: 'id', description: '질문 UUID' })
  @ApiBody(QUESTION_PATCH_BODY)
  updateInterestQuestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateQuestionSchema)) body: UpdateQuestionInput,
  ) {
    return this.questions.updateInterestQuestion(id, body);
  }

  @Delete('interest-questions/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '주제별 질문 삭제 (D-87)' })
  @ApiParam({ name: 'id', description: '질문 UUID' })
  deleteInterestQuestion(@Param('id', ParseUUIDPipe) id: string) {
    return this.questions.deleteInterestQuestion(id);
  }

  @Get('icebreakers')
  @ApiOperation({
    summary: '포괄 아이스브레이킹 질문 목록 (D-87)',
    description: '켜진 것과 꺼진 것 모두. 네트워크가 성립할 때 켜진 것 중 2개를 무작위로 뽑아 고정한다.',
  })
  icebreakers() {
    return this.questions.listIcebreakers();
  }

  @Post('icebreakers')
  @ApiOperation({ summary: '포괄 질문 추가 (D-87)', description: '같은 문장이 있으면 400.' })
  @ApiBody(QUESTION_BODY)
  createIcebreaker(@Body(new ZodValidationPipe(createQuestionSchema)) body: CreateQuestionInput) {
    return this.questions.createIcebreaker(body);
  }

  @Patch('icebreakers/:id')
  @ApiOperation({ summary: '포괄 질문 수정 (D-87)', description: '본문·순서·켜기/끄기.' })
  @ApiParam({ name: 'id', description: '질문 UUID' })
  @ApiBody(QUESTION_PATCH_BODY)
  updateIcebreaker(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateQuestionSchema)) body: UpdateQuestionInput,
  ) {
    return this.questions.updateIcebreaker(id, body);
  }

  @Delete('icebreakers/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: '포괄 질문 삭제 (D-87)',
    description: '이미 성립한 네트워크에 뽑혀 있던 것도 사라진다. 잠시 빼려면 `active=false` 로 끈다.',
  })
  @ApiParam({ name: 'id', description: '질문 UUID' })
  deleteIcebreaker(@Param('id', ParseUUIDPipe) id: string) {
    return this.questions.deleteIcebreaker(id);
  }
}

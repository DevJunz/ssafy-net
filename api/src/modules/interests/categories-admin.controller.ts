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
  CATEGORY_NAME_MAX,
  createCategorySchema,
  updateCategorySchema,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '@ssafy-net/shared';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthGuard, OnboardedGuard, OperatorGuard } from '../auth/auth.guard';
import { CategoriesService } from './categories.service';

/** 관심사 분류(대분류) 관리 (D-86). 운영자만. */
@ApiTags('운영자')
@ApiCookieAuth('sn_session')
@Controller('admin/categories')
@UseGuards(AuthGuard, OnboardedGuard, OperatorGuard)
export class CategoriesAdminController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({
    summary: '관심사 분류 목록 (D-86)',
    description: '`[{ id, name, kind, sortOrder, interestCount }]` 순서대로. `interestCount` 는 숨김·병합을 포함한다.',
  })
  list() {
    return this.categories.list();
  }

  @Post()
  @ApiOperation({
    summary: '분류 추가 (D-86)',
    description: '맨 뒤에 붙는다. `kind=ATTRIBUTE` 면 층처럼 분류당 하나만 고르는 속성이 된다(D-72). 같은 이름이 있으면 400.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', maxLength: CATEGORY_NAME_MAX, example: '디자인' },
        kind: { type: 'string', enum: ['INTEREST', 'ATTRIBUTE'], default: 'INTEREST' },
      },
    },
  })
  create(@Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput) {
    return this.categories.create(body);
  }

  @Patch(':id')
  @ApiOperation({
    summary: '분류 이름·순서 수정 (D-86)',
    description: '`sortOrder` 는 0부터. 그 자리에 들어가고 나머지는 상대 순서를 지킨다. 종류(kind)는 바꿀 수 없다 — 이미 고른 사람들의 규칙이 달라진다.',
  })
  @ApiParam({ name: 'id', description: '분류 UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: CATEGORY_NAME_MAX },
        sortOrder: { type: 'integer', minimum: 0 },
      },
    },
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput,
  ) {
    return this.categories.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: '분류 삭제 (D-86)',
    description: '관심사가 하나도 없을 때만. 있으면 400 과 `details.interestCount`.',
  })
  @ApiParam({ name: 'id', description: '분류 UUID' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(id);
  }
}

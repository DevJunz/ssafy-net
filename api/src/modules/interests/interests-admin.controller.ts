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
  INTEREST_NAME_MAX,
  createAdminInterestSchema,
  updateAdminInterestSchema,
  type CreateAdminInterestInput,
  type UpdateAdminInterestInput,
} from '@ssafy-net/shared';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthGuard, OnboardedGuard, OperatorGuard } from '../auth/auth.guard';
import { InterestsAdminService } from './interests-admin.service';

/** 관심사 관리 (D-88). 운영자만. 분류는 `/admin/categories`(D-86). */
@ApiTags('운영자')
@ApiCookieAuth('sn_session')
@Controller('admin/interests')
@UseGuards(AuthGuard, OnboardedGuard, OperatorGuard)
export class InterestsAdminController {
  constructor(private readonly interests: InterestsAdminService) {}

  @Get()
  @ApiOperation({
    summary: '관심사 목록 (D-88)',
    description:
      '분류 순서 → 관심사 순서로 전부. 숨김·병합된 것도 들어 있다.\n\n' +
      '`holderCount` 는 지금 고르고 있는 사람 수를 실제로 센 값이라 0 이어야 지울 수 있다. ' +
      '`postCount`·`questionCount` 는 지우면 같이 사라지는 것들이다. `userAdded` 는 사용자가 만든 것인지(D-74).',
  })
  list() {
    return this.interests.list();
  }

  @Post()
  @ApiOperation({
    summary: '관심사 추가 (D-88)',
    description:
      '고른 분류의 맨 뒤에 붙는다. 사용자 추가(D-74)와 달리 하루 3개 제한도, 비슷한 것 확인도 없다. ' +
      '같은 이름이 이미 있으면(숨김이어도) 400.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'categoryId'],
      properties: {
        name: { type: 'string', maxLength: INTEREST_NAME_MAX, example: '보드게임' },
        categoryId: { type: 'string', format: 'uuid' },
        aliases: {
          type: 'array',
          items: { type: 'string', maxLength: INTEREST_NAME_MAX },
          example: ['보드 게임', 'boardgame'],
        },
      },
    },
  })
  create(@Body(new ZodValidationPipe(createAdminInterestSchema)) body: CreateAdminInterestInput) {
    return this.interests.create(body);
  }

  @Patch(':id')
  @ApiOperation({
    summary: '관심사 수정 (D-88)',
    description:
      '이름·별칭·분류·순서·상태를 고친다. `status=HIDDEN` 이면 목록에서 내려가고 이미 가진 사람에게만 남는다(docs/08 §5).\n\n' +
      '분류를 옮길 때 종류(이야깃거리↔속성)가 달라지면 고른 사람이 없을 때만 된다 — 속성은 분류당 하나뿐이라(D-72) ' +
      '옮기는 순간 규칙을 어기는 사람이 생긴다. 400 과 `details.holderCount`.\n\n' +
      '`sortOrder` 는 같은 분류 안에서 0부터. 그 자리에 들어가고 나머지는 상대 순서를 지킨다.',
  })
  @ApiParam({ name: 'id', description: '관심사 UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: INTEREST_NAME_MAX },
        categoryId: { type: 'string', format: 'uuid' },
        aliases: { type: 'array', items: { type: 'string', maxLength: INTEREST_NAME_MAX } },
        status: { type: 'string', enum: ['ACTIVE', 'HIDDEN'] },
        sortOrder: { type: 'integer', minimum: 0 },
      },
    },
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAdminInterestSchema)) body: UpdateAdminInterestInput,
  ) {
    return this.interests.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: '관심사 삭제 (D-88)',
    description:
      '고른 사람이 하나도 없을 때만. 있으면 400 과 `details.holderCount` — 그때는 숨김으로 바꾼다.\n\n' +
      '지우면 그 관심사의 글·주제별 질문·변경 이력이 함께 사라진다. 이미 성립한 연결이나 네트워크가 ' +
      '그 id 를 들고 있어도 화면은 없는 것을 지나친다.',
  })
  @ApiParam({ name: 'id', description: '관심사 UUID' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.interests.remove(id);
  }
}

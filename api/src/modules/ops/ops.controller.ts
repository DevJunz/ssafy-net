import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import type { OpsMetrics, OpsNetworkSwitchResult, OpsOperator } from '@ssafy-net/shared';
import { z } from 'zod';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthGuard, OnboardedGuard, OperatorGuard } from '../auth/auth.guard';
import { OpsService } from './ops.service';

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;

const networkSwitchSchema = z.object({ enabled: z.boolean({ message: 'enabled 는 true 또는 false 여야 합니다.' }) });
const addOperatorSchema = z.object({ email: z.string().trim().email('이메일 형식이 아닙니다.') });

/**
 * 운영자 화면 (D-77). 지표를 읽고(GET), 레버 둘을 당긴다 — Network 스위치(D-78)와 운영자 추가·해제(D-79).
 * `is_operator=true` 만. 응답에 실명은 없다 — 사용자는 표시명과 id 뿐이고,
 * 운영자 목록의 이메일은 로그인 계정을 가리키는 용도다(design/20 §11).
 */
@ApiTags('운영자')
@ApiCookieAuth('sn_session')
@Controller('admin/ops')
@UseGuards(AuthGuard, OnboardedGuard, OperatorGuard)
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  @Get()
  @ApiOperation({
    summary: '운영자 대시보드 지표 (제품 + 서버)',
    description:
      'PM 이 매일 보는 것(docs/14 §4·§5)과 서버가 조용히 죽는 곳(design/23)을 한 번에 준다. ' +
      '`days` 는 집계 창(오늘 포함, 기본 14, 최대 90). 비율은 분모가 0이면 null. ' +
      'HTTP·웹훅 카운터는 프로세스 메모리라 재시작하면 0부터다(`since`). ' +
      '열람·클릭은 `analytics_event`(이벤트 기록이 시작된 뒤의 것만, `activity.trackingSince`).',
  })
  @ApiQuery({ name: 'days', required: false, description: '집계 창(일). 기본 14, 최대 90' })
  metrics(@Query('days') days: string | undefined): Promise<OpsMetrics> {
    const parsed = Number(days);
    const window = Number.isFinite(parsed) && parsed >= 1 ? Math.min(Math.floor(parsed), MAX_DAYS) : DEFAULT_DAYS;
    return this.ops.metrics(window);
  }

  @Put('network')
  @ApiOperation({
    summary: 'Network 추천 켜기 / 끄기 (D-78)',
    description:
      '켜면 후보를 다시 계산해 빈 슬롯에 바로 노출한다(배치 `network.recompute` 를 즉시 돌린다). ' +
      '처음 켜는 것이면 온보딩을 마친 전원에게 `NETWORK_ENABLED` 알림을 보낸다(사용자당 한 번, live 모드면 실제 DM). ' +
      '끄면 새 노출만 멈추고 후보 계산은 계속 돈다(D-75).',
  })
  @ApiBody({
    schema: { type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } } },
  })
  setNetwork(
    @Body(new ZodValidationPipe(networkSwitchSchema)) body: { enabled: boolean },
  ): Promise<OpsNetworkSwitchResult> {
    return this.ops.setNetworkEnabled(body.enabled);
  }

  @Get('operators')
  @ApiOperation({
    summary: '운영자 목록 (D-79)',
    description: '표시명·이메일·id. 실명은 없다. `self` 는 호출한 본인이며 해제할 수 없다.',
  })
  operators(@CurrentUser() user: User): Promise<OpsOperator[]> {
    return this.ops.operators(user.id);
  }

  @Post('operators')
  @ApiOperation({
    summary: '운영자 추가 (D-79)',
    description:
      '이메일(Google 계정)로 지정한다. 가입과 온보딩을 마친 사람만 된다. ' +
      '그 이메일의 사용자가 없으면 404 `NOT_FOUND`, 온보딩 전이면 400 `VALIDATION_FAILED`. 이미 운영자면 그대로 돌려준다.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: { email: { type: 'string', example: 'someone@gmail.com' } },
    },
  })
  addOperator(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(addOperatorSchema)) body: { email: string },
  ): Promise<OpsOperator> {
    return this.ops.addOperator(body.email, user.id);
  }

  @Delete('operators/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: '운영자 해제 (D-79)',
    description: '자기 자신은 해제할 수 없다(400). 마지막 운영자가 사라지는 길을 막는다.',
  })
  @ApiParam({ name: 'id', description: '사용자 id' })
  removeOperator(@CurrentUser() user: User, @Param('id') id: string): Promise<void> {
    return this.ops.removeOperator(id, user.id);
  }
}

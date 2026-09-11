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
import type {
  OpsAnnouncement,
  OpsAnnounceResult,
  OpsMetrics,
  OpsNetworkPreview,
  OpsNetworkSwitchResult,
  OpsOperator,
  OpsParameterUpdateResult,
} from '@ssafy-net/shared';
import {
  OPS_EDITABLE_PARAMETERS,
  OPS_EDITABLE_PARAMETER_KEYS,
  type OpsEditableParameterKey,
} from '@ssafy-net/shared';
import { z } from 'zod';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthGuard, OnboardedGuard, OperatorGuard } from '../auth/auth.guard';
import { OpsService } from './ops.service';

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;

const networkSwitchSchema = z.object({ enabled: z.boolean({ message: 'enabled 는 true 또는 false 여야 합니다.' }) });
const inviteSwitchSchema = z.object({ required: z.boolean({ message: 'required 는 true 또는 false 여야 합니다.' }) });
const addOperatorSchema = z.object({ email: z.string().trim().email('이메일 형식이 아닙니다.') });

/**
 * 파라미터 저장(D-91). 키는 열어 둔 둘만 받는다 — 범위는 `OPS_EDITABLE_PARAMETERS` 가 갖고,
 * 값끼리의 관계(P-01 ≤ P-02)는 서비스가 본다.
 */
const parameterSchema = z.object({
  key: z.enum(OPS_EDITABLE_PARAMETER_KEYS as [OpsEditableParameterKey, ...OpsEditableParameterKey[]], {
    message: '운영 화면에서 바꿀 수 있는 값이 아닙니다.',
  }),
  value: z.number().int('정수여야 합니다.'),
});

/** 공지. 제목은 선택, 본문은 필수. 메신저 DM 한 통에 들어갈 만큼만 받는다. */
const announceSchema = z.object({
  title: z.string().trim().max(40, '제목은 40자까지 쓸 수 있습니다.').optional(),
  body: z
    .string()
    .trim()
    .min(1, '공지 내용을 입력해주세요.')
    .max(1000, '공지는 1000자까지 쓸 수 있습니다.'),
  targetPath: z
    .string()
    .trim()
    .regex(/^\/[\w\-/?=&.]*$/, '앱 안의 경로여야 합니다. 예: /networks')
    .max(200)
    .optional(),
});

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

  @Get('network/preview')
  @ApiOperation({
    summary: 'Network 후보 기준값 미리보기 (D-91)',
    description:
      'P-04 를 바꾸면 후보가 몇 개가 되는지 지금 데이터로 계산해 본다. 저장하는 것은 없다 — network_candidate 는 그대로다. ' +
      '줄마다 후보 수, 후보에 이름이 오른 사람 수, 1인당 슬롯(게이트와 같은 계산), ' +
      '그리고 공통 관심사가 전부 인기 관심사(보유율 30%+)뿐인 후보의 비율을 준다. ' +
      '마지막 값이 높으면 "이 3명은 백엔드·알고리즘·취업 준비를 공유합니다" 같은 추천이라 대화 명분이 되지 않는다(docs/10 §3·§4). ' +
      '기준값을 낮출수록 계산이 오래 걸린다(computeMs). 재계산도 같은 파이프라인을 쓰므로 여기 시간이 곧 배치 시간이다.',
  })
  networkPreview(): Promise<OpsNetworkPreview> {
    return this.ops.networkPreview();
  }

  @Put('parameters')
  @ApiOperation({
    summary: '후보 기준값 바꾸기 (D-91)',
    description:
      'P-04(전원 교집합 기준)와 P-01(관심사 최소 선택 수)만 바꿀 수 있다. 나머지는 design/20 §9 대로 DB 에서 바꾼다. ' +
      '저장하면 캐시를 바로 비우고 network.recompute 를 즉시 돌려 후보·노출 수를 돌려준다. ' +
      '이미 노출된 추천은 바뀌지 않는다 — 노출 시점의 스냅샷으로 굳어 있다(D-45). ' +
      'network_enabled 가 꺼져 있으면 후보만 계산되고 노출·알림은 나가지 않는다(D-75). ' +
      'app_parameter_change 에 옛 값과 새 값이 남는다.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['key', 'value'],
      properties: {
        key: { type: 'string', enum: [...OPS_EDITABLE_PARAMETER_KEYS], example: 'P-04' },
        value: {
          type: 'integer',
          example: 4,
          description: `P-04 는 ${OPS_EDITABLE_PARAMETERS['P-04'].min}~${OPS_EDITABLE_PARAMETERS['P-04'].max}, P-01 은 ${OPS_EDITABLE_PARAMETERS['P-01'].min}~${OPS_EDITABLE_PARAMETERS['P-01'].max}`,
        },
      },
    },
  })
  setParameter(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(parameterSchema))
    body: { key: OpsEditableParameterKey; value: number },
  ): Promise<OpsParameterUpdateResult> {
    return this.ops.setParameter(body.key, body.value, user.id);
  }

  @Put('invite')
  @ApiOperation({
    summary: '가입에 초대 링크 필요 켜기 / 끄기 (D-84)',
    description:
      '기본은 꺼짐 — 누구나 Google 로 바로 가입하고 온보딩의 Mattermost 인증(D-66)이 소속 검증이다. ' +
      '켜면 옛 규칙대로 초대 링크(`/invite/<code>`)를 연 사람만 가입한다. 이미 가입한 사람에게는 영향이 없다. ' +
      '소개 화면은 `GET /api/parameters` 의 `features.invite_required` 를 본다.',
  })
  @ApiBody({
    schema: { type: 'object', required: ['required'], properties: { required: { type: 'boolean' } } },
  })
  async setInvite(
    @Body(new ZodValidationPipe(inviteSwitchSchema)) body: { required: boolean },
  ): Promise<{ required: boolean }> {
    await this.ops.setInviteRequired(body.required);
    return { required: body.required };
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

  @Get('announcements')
  @ApiOperation({
    summary: '보낸 공지 목록',
    description: '최근 10건. 받은 사람 수와 메신저로 실제 나간 수를 함께 준다.',
  })
  announcements(): Promise<OpsAnnouncement[]> {
    return this.ops.announcements();
  }

  @Post('announce')
  @ApiOperation({
    summary: '전체 공지 보내기',
    description:
      '온보딩을 마친 활성 사용자 **전원**의 알림함에 남기고, 메신저 DM 은 "즉시 알림"을 켜 둔 사람에게만 보낸다. ' +
      '발송은 동시 5건으로 흘려보내므로 1,000명이면 몇 분에 걸쳐 나간다 — 응답은 기다리지 않고 바로 돌아온다. ' +
      '`targetPath` 를 주면 알림을 눌렀을 때 그 화면으로 간다(기본 `/`). ' +
      '**되돌릴 수 없다.** 보낸 알림은 지워지지 않는다.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['body'],
      properties: {
        title: { type: 'string', maxLength: 40, example: '점검 안내' },
        body: { type: 'string', maxLength: 1000, example: '오늘 저녁 8시부터 10분간 접속이 잠시 끊길 수 있습니다.' },
        targetPath: { type: 'string', example: '/networks' },
      },
    },
  })
  announce(
    @Body(new ZodValidationPipe(announceSchema))
    body: { title?: string; body: string; targetPath?: string },
  ): Promise<OpsAnnounceResult> {
    return this.ops.announce(body);
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

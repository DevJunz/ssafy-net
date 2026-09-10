import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { OpsMetrics } from '@ssafy-net/shared';
import { AuthGuard, OnboardedGuard, OperatorGuard } from '../auth/auth.guard';
import { OpsService } from './ops.service';

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;

/**
 * 운영자 대시보드 데이터 (D-77). 화면은 web `/ops`.
 * `is_operator=true` 만. 응답에 실명은 없다 — 사용자는 표시명과 id 뿐이다(design/20 §11).
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
}

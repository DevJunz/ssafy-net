import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthGuard } from '../auth/auth.guard';
import { AnalyticsService } from './analytics.service';

const trackEventsSchema = z.object({
  events: z
    .array(
      z.object({
        name: z.string().min(1).max(64),
        props: z.record(z.string(), z.unknown()).optional(),
        occurredAt: z.string().max(40).optional(),
      }),
    )
    .min(1)
    .max(50),
  sessionId: z.string().max(64).optional(),
});

type TrackEventsBody = z.infer<typeof trackEventsSchema>;

@ApiTags('측정')
@ApiCookieAuth('sn_session')
@Controller('events')
@UseGuards(AuthGuard)
export class EventsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({
    summary: '프론트 이벤트 묶음 기록',
    description:
      '화면 안에서만 일어나는 클릭을 모아 보낸다(design/22 §14). 이름은 `CLIENT_EVENTS`(packages/shared) 안의 것만 받고 ' +
      '나머지는 조용히 버린다 — 서버가 보는 열람(graph.view 등)은 서버가 직접 남기므로 프론트가 보내면 중복이다. ' +
      '한 번에 50개까지. 온보딩 미완료여도 보낼 수 있다(온보딩 퍼널 이벤트).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['events'],
      properties: {
        events: {
          type: 'array',
          maxItems: 50,
          items: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', example: 'graph.interest_click' },
              props: { type: 'object' },
              occurredAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        sessionId: { type: 'string' },
      },
    },
  })
  ingest(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(trackEventsSchema)) body: TrackEventsBody,
  ) {
    return this.analytics.ingest(user.id, body);
  }
}

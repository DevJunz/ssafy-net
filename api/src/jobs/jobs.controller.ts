import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../infra/prisma/prisma.service';
import { AuthGuard, OnboardedGuard, OperatorGuard } from '../modules/auth/auth.guard';
import { JobsService } from './jobs.service';

const JOB_NAMES = [
  'request.expire',
  'request.expiry-remind',
  'connection.initiator-remind',
  'connection.follow-up',
  'network.recompute',
  'network.expire',
  'network.expiry-remind',
  'network.initiator-remind',
  'gate.evaluate',
  'digest.send',
  'weekend.summary',
];

/**
 * 운영자용 배치 제어 (L6 — 관리 UI는 없다).
 *
 * 시간 파라미터가 하루 단위라 개발 중에 3일을 기다릴 수 없다.
 * 데이터의 시각을 앞당기고 이 엔드포인트로 잡을 즉시 돌려 확인한다.
 */
@ApiTags('운영자')
@ApiCookieAuth('sn_session')
@Controller('admin/jobs')
@UseGuards(AuthGuard, OnboardedGuard, OperatorGuard)
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '배치 실행 이력',
    description: '`is_operator=true`만. 최근 30건. `[{ job, status, startedAt, detail }]`. 배치는 API 프로세스 안의 cron이라 인스턴스가 둘이면 두 번 돈다(design/20 §7).',
  })
  async history() {
    const runs = await this.prisma.jobRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 30,
    });
    return runs.map((run) => ({
      job: run.jobName,
      status: run.status,
      startedAt: run.startedAt,
      detail: run.detail,
    }));
  }

  @Post('run')
  @ApiOperation({
    summary: '배치 즉시 실행',
    description:
      '시간 파라미터가 하루 단위라 개발 중에 3일을 기다릴 수 없다. 데이터의 시각을 앞당기고 여기서 바로 돌려 확인한다.\n\n' +
      '| 이름 | 하는 일 |\n|---|---|\n' +
      '| `request.expire` | P-05(3)일 지난 요청 만료 |\n' +
      '| `request.expiry-remind` | 만료 하루 전 수신자 리마인드 |\n' +
      '| `connection.initiator-remind` | 성립 1일 후 아직 "메시지를 보냈어요"가 없는 시작자 재안내 |\n' +
      '| `connection.follow-up` | 성립 P-18(2)일 후 "대화를 시작하셨나요?" 생성 |\n' +
      '| `network.recompute` | Network 후보 재계산 + 빈 슬롯 노출(하루 2회) |\n' +
      '| `network.expire` | P-10(3)일 지난 Network 만료. 미달이면 `NETWORK_FAILED` |\n' +
      '| `network.expiry-remind` | Network 만료 하루 전 리마인드 |\n' +
      '| `network.initiator-remind` | 성립된 Network의 시작자 재안내 |\n' +
      '| `gate.evaluate` | 데이터 게이트 판정 기록 |\n' +
      '| `digest.send` | 묶음 알림(첫 2주 일 1회, 이후 주 1회). **live 모드면 전원에게 DM** |\n' +
      '| `weekend.summary` | 주말에 미뤄 둔 DM 을 사람마다 한 통으로(D-95) |\n\n' +
      '`network.recompute` 와 `digest.send` 는 운영자가 끄고 켤 수 있지만(D-96), 여기 즉시 실행은 그 스위치를 보지 않는다 — 꺼 둬도 돈다.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string', enum: JOB_NAMES, example: 'request.expire' } },
    },
  })
  run(@Body() body: { name: string }) {
    return this.jobs.runNow(body?.name ?? '');
  }
}

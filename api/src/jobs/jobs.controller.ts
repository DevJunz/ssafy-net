import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '../infra/prisma/prisma.service';
import { AuthGuard, OnboardedGuard, OperatorGuard } from '../modules/auth/auth.guard';
import { JobsService } from './jobs.service';

/**
 * 운영자용 배치 제어 (L6 — 관리 UI는 없다).
 *
 * 시간 파라미터가 하루 단위라 개발 중에 3일을 기다릴 수 없다.
 * 데이터의 시각을 앞당기고 이 엔드포인트로 잡을 즉시 돌려 확인한다.
 */
@Controller('admin/jobs')
@UseGuards(AuthGuard, OnboardedGuard, OperatorGuard)
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
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
  run(@Body() body: { name: string }) {
    return this.jobs.runNow(body?.name ?? '');
  }
}

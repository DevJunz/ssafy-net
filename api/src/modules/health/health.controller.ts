import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * 헬스체크 (design/23 §4).
 *
 * 컨테이너 healthcheck 와 외부 모니터(UptimeRobot)가 30초~5분마다 부른다.
 * DB 까지 확인해야 "프로세스는 떠 있는데 DB 가 죽은" 상태를 잡는다.
 * 비로그인. 응답에 사용자 정보는 없다.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: '헬스체크',
    description: '비로그인. DB 에 SELECT 1 을 보내고 실패하면 503. 외부 모니터와 컨테이너 healthcheck 가 쓴다.',
  })
  async check(): Promise<{ ok: true; uptimeSec: number }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ code: 'INTERNAL', message: 'db unavailable' });
    }
    return { ok: true, uptimeSec: Math.round(process.uptime()) };
  }
}

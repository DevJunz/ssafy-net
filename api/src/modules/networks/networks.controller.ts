import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthGuard, OnboardedGuard, OperatorGuard } from '../auth/auth.guard';
import { CandidateService } from './candidate.service';
import { ExposureService } from './exposure.service';
import { NetworksService } from './networks.service';

@Controller('networks')
@UseGuards(AuthGuard, OnboardedGuard)
export class NetworksController {
  constructor(private readonly networks: NetworksService) {}

  @Get()
  list(@CurrentUser() user: User, @Query('tab') tab = 'recommended') {
    return this.networks.list(user, tab);
  }

  @Get(':id')
  detail(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.networks.detail(user, id);
  }

  @Post(':id/join')
  join(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.networks.join(user, id);
  }

  @Post(':id/leave')
  leave(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.networks.leave(user, id);
  }

  @Post(':id/decline')
  decline(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.networks.decline(user, id);
  }

  @Post(':id/mark-invited')
  markInvited(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.networks.markInvited(user, id);
  }
}

/**
 * 운영자용 (docs/10 §4). 관리 UI는 만들지 않는다(L6).
 * 게이트 판단은 공개 3일째에 운영자가 이 값을 보고 network_enabled를 켠다.
 */
@Controller('admin/networks')
@UseGuards(AuthGuard, OnboardedGuard, OperatorGuard)
export class NetworksAdminController {
  constructor(
    private readonly candidates: CandidateService,
    private readonly exposure: ExposureService,
  ) {}

  @Get('gate')
  gate() {
    return this.candidates.evaluateGate();
  }

  @Post('recompute')
  async recompute() {
    const candidates = await this.candidates.recomputeAll();
    return { candidates: candidates.length, gate: await this.candidates.evaluateGate() };
  }

  @Post('expose')
  expose() {
    return this.exposure.expose();
  }
}

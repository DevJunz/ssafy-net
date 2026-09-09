import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthGuard, OnboardedGuard, OperatorGuard } from '../auth/auth.guard';
import { CandidateService } from './candidate.service';
import { ExposureService } from './exposure.service';
import { NetworksService } from './networks.service';

const NETWORK_ID = { name: 'id', description: 'Network 추천 UUID' };

@ApiTags('Network 추천')
@ApiCookieAuth('sn_session')
@Controller('networks')
@UseGuards(AuthGuard, OnboardedGuard)
export class NetworksController {
  constructor(private readonly networks: NetworksService) {}

  @Get()
  @ApiOperation({
    summary: 'Network 추천 목록',
    description:
      '전원이 관심사 P-04(5, 최저 4)개 이상을 공유하는 3~6명 그룹 추천(S2, docs/10). ' +
      '`network_enabled` 플래그가 꺼져 있으면 추천이 노출되지 않는다(D-75). 켜는 것은 게이트 판정(공개 3일째, 1인당 후보 ≥ 1) 뒤 운영자의 결정이다.\n\n' +
      '- `recommended`: 나에게 노출된 것(동시 최대 3개, P-11). 만료 P-10(3)일\n' +
      '- `joined`: 내가 참여했지만 아직 성립 전\n' +
      '- `activated`: 성립된 것',
  })
  @ApiQuery({ name: 'tab', required: false, enum: ['recommended', 'joined', 'activated'], description: '기본 recommended' })
  list(@CurrentUser() user: User, @Query('tab') tab = 'recommended') {
    return this.networks.list(user, tab);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Network 상세 (Network 패널)',
    description:
      '`{ id, reason, commonInterests, members: [{ user, decision, joinOrder }], joinedCount, requiredCount, expiresAt, status, myDecision, wouldBeInitiator, snapshotNote }`.\n\n' +
      '- `reason`은 서버가 완성한 문장("이 4명은 관심사 5개를 모두 공유합니다", docs/13 §4)\n' +
      '- 거절한 멤버는 `members`에 없다. 성립 전에는 실명 없음, 성립 후 **참여자만** `realName`(docs/12 §6)\n' +
      '- `wouldBeInitiator`: 내가 첫 참여자가 되는지. 참여 전 확인 문구용(docs/07 §4.1)',
  })
  @ApiParam(NETWORK_ID)
  detail(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.networks.detail(user, id);
  }

  @Post(':id/join')
  @ApiOperation({
    summary: 'Network 참여',
    description:
      'P-09(3)명째 참여하면 나머지 결정을 기다리지 않고 **즉시 성립**(`ACTIVATED`, D-44). ' +
      '시작자 = 첫 참여자(D-18). 성립 시 참여자 전원에게 실명·@아이디와 함께 알림이 간다.',
  })
  @ApiParam(NETWORK_ID)
  join(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.networks.join(user, id);
  }

  @Post(':id/leave')
  @ApiOperation({
    summary: '참여 철회 (성립 전)',
    description: '성립 전에만. 첫 참여자가 빠지면 시작자가 다음 참여자로 넘어간다(docs/10 §5). 성립 후 탈퇴는 없다(docs/10 §8).',
  })
  @ApiParam(NETWORK_ID)
  leave(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.networks.leave(user, id);
  }

  @Post(':id/decline')
  @ApiOperation({
    summary: 'Network 거절',
    description: '다른 멤버에게 알리지 않는다. 같은 멤버 집합은 다시 추천되지 않는다(docs/10 §7).',
  })
  @ApiParam(NETWORK_ID)
  decline(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.networks.decline(user, id);
  }

  @Post(':id/mark-invited')
  @ApiOperation({
    summary: '"메신저에 그룹을 만들었어요"',
    description: '성립된 Network의 시작자가 메신저 그룹 대화를 만들었다고 표시한다. 1:1의 `mark-started`에 해당한다.',
  })
  @ApiParam(NETWORK_ID)
  markInvited(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.networks.markInvited(user, id);
  }
}

/**
 * 운영자용 (docs/10 §4). 관리 UI는 만들지 않는다(L6).
 * 게이트 판단은 공개 3일째에 운영자가 이 값을 보고 network_enabled를 켠다.
 */
@ApiTags('운영자')
@ApiCookieAuth('sn_session')
@Controller('admin/networks')
@UseGuards(AuthGuard, OnboardedGuard, OperatorGuard)
export class NetworksAdminController {
  constructor(
    private readonly candidates: CandidateService,
    private readonly exposure: ExposureService,
  ) {}

  @Get('gate')
  @ApiOperation({
    summary: 'Network 데이터 게이트 판정',
    description:
      '`is_operator=true`만. 1인당 후보 수와 게이트 통과 여부(docs/10 §4). ' +
      '공개 3일째에 운영자가 이 값을 보고 `network_enabled`를 켠다. 미통과면 P-04를 5→4로 낮춰 다시 본다(3까지는 낮추지 않는다, D-43). ' +
      '기능 플래그를 켜는 엔드포인트는 아직 없다 — DB에서 직접 바꾼다(30초 캐시).',
  })
  gate() {
    return this.candidates.evaluateGate();
  }

  @Post('recompute')
  @ApiOperation({
    summary: 'Network 후보 풀 전체 재계산',
    description:
      '탐욕적 확장으로 후보를 다시 만든다(D-65, design/20 §6.3). 배치 `network.recompute`(하루 2회)와 같은 일을 즉시 한다. ' +
      '응답에 후보 수와 게이트 판정. 1,006명 실측 1.1초.',
  })
  recompute() {
    return this.candidates.recomputeAll().then(async (candidates) => ({
      candidates: candidates.length,
      gate: await this.candidates.evaluateGate(),
    }));
  }

  @Post('expose')
  @ApiOperation({
    summary: '빈 슬롯에 후보 노출',
    description:
      '각 사용자의 빈 노출 슬롯(최대 3개)에 우선순위 순으로 후보를 올리고 멤버 전원에게 알림을 보낸다. ' +
      '`network_enabled`가 꺼져 있으면 아무것도 노출하지 않는다(D-75). **`MATTERMOST_DELIVERY_MODE=live`면 실제 DM이 나간다.**',
  })
  expose() {
    return this.exposure.expose();
  }
}

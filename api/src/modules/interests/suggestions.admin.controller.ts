import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, OnboardedGuard, OperatorGuard } from '../auth/auth.guard';
import { SuggestionsService } from './suggestions.service';

/**
 * 운영자용 제안 처리 (docs/08 §4, L6 — 관리 UI는 없다).
 * 사용이 2주에 집중되므로 첫 주에는 매일 확인해야 한다.
 * 채택이 늦으면 제안자가 이미 떠난 뒤다.
 */
@Controller('admin/interest-suggestions')
@UseGuards(AuthGuard, OnboardedGuard, OperatorGuard)
export class SuggestionsAdminController {
  constructor(private readonly suggestions: SuggestionsService) {}

  @Get()
  pending() {
    return this.suggestions.pending();
  }

  @Post(':id/resolve')
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { action: 'ACCEPT' | 'REJECT'; categoryId?: string; note?: string },
  ) {
    return this.suggestions.resolve(id, body);
  }
}

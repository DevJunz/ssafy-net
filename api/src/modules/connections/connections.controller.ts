import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import {
  connectionRequestSchema,
  followUpResponseSchema,
  type ConnectionRequestInput,
  type FollowUpResponseInput,
} from '@ssafy-net/shared';
import { AppError } from '../../common/app-error';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuthGuard, OnboardedGuard } from '../auth/auth.guard';
import { ConnectionsService } from './connections.service';
import { FollowUpService } from './follow-up.service';
import { QuotaService } from './quota.service';

@Controller()
@UseGuards(AuthGuard, OnboardedGuard)
export class ConnectionsController {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly quota: QuotaService,
    private readonly followUps: FollowUpService,
  ) {}

  @Get('me/request-quota')
  requestQuota(@CurrentUser() user: User) {
    return this.quota.quota(user.id);
  }

  @Post('connection-requests')
  create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(connectionRequestSchema))
    body: ConnectionRequestInput,
  ) {
    return this.connections.createRequest(user, body);
  }

  @Get('connection-requests')
  list(@CurrentUser() user: User, @Query('box') box: string | undefined) {
    if (box === 'sent') return this.connections.sent(user);
    if (box === 'received') return this.connections.received(user);
    throw new AppError('VALIDATION_FAILED', undefined, 'box는 received 또는 sent여야 합니다.');
  }

  @Get('connection-requests/:id')
  detail(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.connections.requestDetail(user, id);
  }

  @Post('connection-requests/:id/accept')
  accept(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.connections.accept(user, id);
  }

  @Post('connection-requests/:id/reject')
  reject(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.connections.reject(user, id);
  }

  @Post('connection-requests/:id/reject/undo')
  undoReject(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.connections.undoReject(user, id);
  }

  @Delete('connection-requests/:id')
  cancel(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.connections.cancel(user, id);
  }

  @Get('connections')
  connectionList(@CurrentUser() user: User) {
    return this.connections.list(user);
  }

  @Get('connections/:id')
  connectionDetail(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.connections.connectionDetail(user, id);
  }

  @Post('connections/:id/mark-started')
  markStarted(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.connections.markStarted(user, id);
  }

  @Get('follow-ups/pending')
  pendingFollowUps(@CurrentUser() user: User) {
    return this.followUps.pending(user);
  }

  @Post('follow-ups/:id/respond')
  respondFollowUp(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(followUpResponseSchema))
    body: FollowUpResponseInput,
  ) {
    return this.followUps.respond(user, id, body);
  }
}

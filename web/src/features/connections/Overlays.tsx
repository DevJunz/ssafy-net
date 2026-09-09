import type {
  ConnectionDetail,
  FollowUpItem,
  PublicUser,
  RequestDetail,
  RequestQuota,
} from '@ssafy-net/shared';
import { FOLLOW_UP_REASONS } from '@ssafy-net/shared';
import { useEffect, useState, type ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { api, RequestFailed } from '../../api/client';
import {
  CardRowButton,
  Chips,
  ChipTag,
  ErrorText,
  Muted,
  Notice,
  Tag,
} from '../../components/primitives';
import {
  OverlayActions,
  OverlaySection,
  ResponsiveDialog,
} from '../../components/ResponsiveDialog';

/** 성립 화면의 Action 안내. 가장 눈에 띄어야 한다(docs/06 §3.12). */
export function ActionBox({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-[11px] border border-primary/30 bg-accent p-4', className)}
      {...props}
    />
  );
}

export function ActionHeadline({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('text-[15px] leading-normal font-semibold text-accent-foreground', className)}
      {...props}
    />
  );
}

/** 복사할 값은 이름·아이디라 본문 글꼴 그대로 둔다. 고정폭이면 한글이 어색하다. */
export function CopyRow({
  text,
  label,
  copiedLabel,
}: {
  text: string;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mt-3 flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border border-primary/30 bg-card px-[11px] py-2 font-sans text-sm font-semibold">
        {text}
      </code>
      <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
        {copied ? copiedLabel : label}
      </Button>
    </div>
  );
}

export function Quote({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'border-l-[3px] border-input pl-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground/70',
        className,
      )}
      {...props}
    />
  );
}

/**
 * 연결 요청 작성 (docs/06 §3.12).
 * 공통 관심사를 미리 보여 메시지 소재로 쓰게 한다(FR-9.2).
 * 공통 관심사가 0개여도 보낼 수 있다(docs/09 §2).
 */
export function RequestComposeOverlay({
  target,
  entryPoint,
  onClose,
  onSent,
}: {
  target: PublicUser;
  entryPoint: string;
  onClose: () => void;
  onSent: (warning: string | null) => void;
}) {
  const [message, setMessage] = useState('');
  const [quota, setQuota] = useState<RequestQuota | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get<RequestQuota>('/me/request-quota').then(setQuota).catch(() => {});
  }, []);

  const common = target.interests.filter((interest) => interest.isCommon);
  const limit = 200;

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const result = await api.post<{ warning: string | null }>(
        '/connection-requests',
        { targetId: target.id, message: message.trim(), entryPoint },
      );
      onSent(result.warning);
    } catch (e) {
      setError(e instanceof RequestFailed ? e.message : '보내지 못했습니다.');
    } finally {
      setSending(false);
    }
  };

  return (
    <ResponsiveDialog
      title={`${target.displayName}님에게 연결 요청`}
      description="상대가 수락하면 서로 실명이 공개됩니다."
      onClose={onClose}
    >
      <OverlaySection>
        {common.length > 0 ? (
          <>
            <Muted className="mb-1.5">공통 관심사 {common.length}개</Muted>
            <Chips>
              {common.map((interest) => (
                <ChipTag key={interest.id} selected>
                  {interest.name}
                </ChipTag>
              ))}
            </Chips>
          </>
        ) : (
          <Notice>공통 관심사가 없습니다. 왜 이야기하고 싶은지 적어주세요.</Notice>
        )}
      </OverlaySection>

      <OverlaySection>
        <Textarea
          value={message}
          maxLength={limit}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="어떤 이야기를 나누고 싶은지 한두 문장이면 충분합니다."
          className="min-h-24 resize-y rounded-[9px] px-3 py-[11px] text-sm"
        />
        <div className="flex items-center justify-between gap-3">
          <Muted>
            {quota &&
              `오늘 ${quota.dailyLimit - quota.dailyUsed}번 더 보낼 수 있습니다`}
          </Muted>
          <Muted>
            {message.length} / {limit}
          </Muted>
        </div>
      </OverlaySection>

      {error && <ErrorText className="mt-3">{error}</ErrorText>}

      <OverlayActions>
        <Button
          type="button"
          className="flex-1"
          disabled={!message.trim() || sending}
          onClick={() => void send()}
        >
          보내기
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          취소
        </Button>
      </OverlayActions>
    </ResponsiveDialog>
  );
}

/** 받은 요청 상세 (docs/06 §3.12). 판단 근거를 한 화면에 모은다. */
export function RequestDetailOverlay({
  requestId,
  onClose,
  onAccepted,
  onRejected,
}: {
  requestId: string;
  onClose: () => void;
  onAccepted: (connection: ConnectionDetail) => void;
  onRejected: (requestId: string, undoUntil: string) => void;
}) {
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<RequestDetail>(`/connection-requests/${requestId}`)
      .then(setDetail)
      .catch((e) =>
        setError(e instanceof RequestFailed ? e.message : '불러오지 못했습니다.'),
      );
  }, [requestId]);

  const accept = async () => {
    setBusy(true);
    try {
      onAccepted(
        await api.post<ConnectionDetail>(
          `/connection-requests/${requestId}/accept`,
        ),
      );
    } catch (e) {
      setError(e instanceof RequestFailed ? e.message : '실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    setBusy(true);
    try {
      const result = await api.post<{ undoUntil: string }>(
        `/connection-requests/${requestId}/reject`,
      );
      onRejected(requestId, result.undoUntil);
    } catch (e) {
      setError(e instanceof RequestFailed ? e.message : '실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <ResponsiveDialog title={error} onClose={onClose}>
        <OverlayActions>
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            닫기
          </Button>
        </OverlayActions>
      </ResponsiveDialog>
    );
  }

  if (!detail) {
    return (
      <ResponsiveDialog
        title={<span className="sr-only">받은 요청</span>}
        onClose={onClose}
      >
        <Muted>불러오는 중…</Muted>
      </ResponsiveDialog>
    );
  }

  return (
    <ResponsiveDialog
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          {detail.from.displayName}
          {detail.from.displayNameType === 'REAL' && <Tag tone="real">실명</Tag>}
        </span>
      }
      description={`공통 관심사 ${detail.commonInterests.length}개 · ${detail.daysLeft}일 남음`}
      onClose={onClose}
    >
      <OverlaySection>
        <Quote>{detail.message}</Quote>
      </OverlaySection>

      <OverlaySection>
        <Muted className="mb-1.5">{detail.from.displayName}님의 관심사</Muted>
        <Chips>
          {detail.from.interests.map((interest) => (
            <ChipTag key={interest.id} selected={interest.isCommon}>
              {interest.name}
            </ChipTag>
          ))}
        </Chips>
      </OverlaySection>

      {/* 닉네임 사용자만 확인을 거친다. 수락은 실명 공개를 동반한다(docs/07 §3.3) */}
      {confirming ? (
        <OverlaySection>
          <Notice>
            수락하면 내 실명(
            <strong className="font-semibold text-foreground">{detail.myRealName}</strong>
            )이 상대에게 공개됩니다. 수락할까요?
          </Notice>
        </OverlaySection>
      ) : null}

      <OverlayActions>
        <Button
          type="button"
          className="flex-1"
          disabled={busy}
          onClick={() =>
            detail.revealsMyRealName && !confirming
              ? setConfirming(true)
              : void accept()
          }
        >
          {confirming ? '네, 수락합니다' : '수락'}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void reject()}>
          거절
        </Button>
      </OverlayActions>
      {/* 거절 버튼 옆에 상시 표시한다(docs/07 §3.4) */}
      <Muted className="mt-2 text-right">거절은 상대에게 알려지지 않습니다.</Muted>
    </ResponsiveDialog>
  );
}

/**
 * 연결 성립 (docs/06 §3.12).
 * Action 안내가 가장 눈에 띄어야 한다. H5의 가장 약한 고리를 보강하는 장치다.
 */
export function ConnectionOverlay({
  detail,
  onClose,
  onMarked,
}: {
  detail: ConnectionDetail;
  onClose: () => void;
  onMarked: () => void;
}) {
  const [marked, setMarked] = useState(detail.started);

  const mark = async () => {
    await api.post(`/connections/${detail.id}/mark-started`);
    setMarked(true);
    onMarked();
  };

  return (
    <ResponsiveDialog title="연결되었습니다" onClose={onClose}>
      <div className="mt-1.5 mb-0.5 text-[26px] leading-tight font-bold tracking-tight">
        {detail.counterpart.realName}
      </div>

      <OverlaySection>
        <ActionBox>
          <ActionHeadline>{detail.action.text}</ActionHeadline>
          <CopyRow text={detail.action.copyText} label="복사" copiedLabel="복사됨" />
          {/* 아이디를 알면 대화창을 바로 연다. 찾는 단계 자체가 사라진다(D-66). */}
          {detail.action.mattermostLink && (
            <Button asChild className="mt-2.5 w-full">
              <a href={detail.action.mattermostLink} target="_blank" rel="noreferrer">
                Mattermost에서 대화 열기
              </a>
            </Button>
          )}
        </ActionBox>
      </OverlaySection>

      {detail.commonInterests.length > 0 && (
        <OverlaySection>
          <Muted className="mb-1.5">첫 대화 소재</Muted>
          <Chips>
            {detail.commonInterests.map((interest) => (
              <ChipTag key={interest.id} selected>
                {interest.name}
              </ChipTag>
            ))}
          </Chips>
        </OverlaySection>
      )}

      {detail.requestMessage && (
        <OverlaySection>
          <Muted className="mb-1.5">요청 메시지</Muted>
          <Quote>{detail.requestMessage}</Quote>
        </OverlaySection>
      )}

      <OverlayActions>
        <Button
          type="button"
          className="flex-1"
          disabled={marked}
          onClick={() => void mark()}
        >
          {marked ? '표시함 ✓' : detail.action.buttonLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          닫기
        </Button>
      </OverlayActions>
    </ResponsiveDialog>
  );
}

/** 후속 확인 (M14). 질문 하나. 대화가 외부에서 일어나므로 유일한 측정 신호다. */
export function FollowUpOverlay({
  item,
  onClose,
  onAnswered,
}: {
  item: FollowUpItem;
  onClose: () => void;
  onAnswered: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const respond = async (payload: Record<string, unknown>) => {
    await api.post(`/follow-ups/${item.id}/respond`, payload);
    onAnswered();
  };

  if (asking) {
    return (
      <ResponsiveDialog
        title={`${item.counterpartName}님에게 알릴까요?`}
        description={'"먼저 연락해주세요"라고 상대에게 알림을 보낼 수 있습니다.'}
        onClose={onClose}
      >
        <OverlayActions>
          <Button
            type="button"
            className="flex-1"
            onClick={() =>
              void respond({ started: false, reason: 'NOT_FOUND', askCounterpart: true })
            }
          >
            네, 알려주세요
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void respond({ started: false, reason: 'NOT_FOUND', askCounterpart: false })
            }
          >
            괜찮습니다
          </Button>
        </OverlayActions>
      </ResponsiveDialog>
    );
  }

  return (
    <ResponsiveDialog title={item.question} onClose={onClose}>
      {reason === null ? (
        <OverlayActions>
          <Button
            type="button"
            className="flex-1"
            onClick={() => void respond({ started: true })}
          >
            예
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => setReason('')}
          >
            아니오
          </Button>
        </OverlayActions>
      ) : (
        <OverlaySection className="flex flex-col gap-1">
          <Muted>이유를 하나만 알려주세요.</Muted>
          {FOLLOW_UP_REASONS.map((option) => (
            <CardRowButton
              key={option.value}
              className="mb-0"
              onClick={() =>
                option.value === 'NOT_FOUND'
                  ? setAsking(true)
                  : void respond({ started: false, reason: option.value })
              }
            >
              {option.label}
            </CardRowButton>
          ))}
        </OverlaySection>
      )}
    </ResponsiveDialog>
  );
}

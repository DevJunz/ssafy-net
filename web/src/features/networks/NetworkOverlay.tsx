import type { ConnectedUser, NetworkDetail } from '@ssafy-net/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, RequestFailed } from '../../api/client';
import {
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
import { ActionBox, ActionHeadline, CopyRow } from '../connections/Overlays';

/**
 * Network 상세와 성립 화면 (docs/06 §3.6, §3.12).
 *
 * 성립 전에는 참여 판단에 필요한 것만 보여준다: 누가, 왜, 무엇을 공유하는지.
 * 성립 후에는 Action 안내가 가장 눈에 띄어야 한다 — 시작자의 역할은
 * "그룹 대화를 열고 초대"까지이지 첫 발언까지가 아니다(docs/10 §5).
 */
export function NetworkOverlay({
  detail,
  onClose,
  onChanged,
}: {
  detail: NetworkDetail;
  onClose: () => void;
  onChanged: (next: NetworkDetail) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marked, setMarked] = useState(detail.started);

  const act = async (path: string) => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await api.post<NetworkDetail>(`/networks/${detail.id}/${path}`));
      setConfirming(false);
    } catch (e) {
      setError(e instanceof RequestFailed ? e.message : '실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const activated = detail.status === 'ACTIVATED';
  const joined = detail.myDecision === 'JOINED';

  return (
    <ResponsiveDialog
      title={activated ? '네트워크가 성립되었습니다' : '추천 네트워크'}
      // 이유가 완전해야 한다: 개수와 이름을 전부 보여준다(docs/13 원칙 3)
      description={detail.reason}
      onClose={onClose}
    >
      <OverlaySection>
        <Chips>
          {detail.commonInterests.map((interest) => (
            <ChipTag key={interest.id} selected>
              {interest.name}
            </ChipTag>
          ))}
        </Chips>
        <Muted className="mt-1.5 text-[11px]">{detail.snapshotNote}</Muted>
      </OverlaySection>

      {activated && detail.action && (
        <OverlaySection>
          <ActionBox>
            <ActionHeadline>{detail.action.text}</ActionHeadline>
            <CopyRow text={detail.action.copyText} label="전체 복사" copiedLabel="복사됨" />
          </ActionBox>
        </OverlaySection>
      )}

      <OverlaySection>
        <Muted className="mb-2">
          멤버 {detail.members.length}명 · {detail.joinedCount}명 참여 ·{' '}
          {detail.requiredCount}명이 되면 성립
          {!activated && ` · ${detail.daysLeft}일 남음`}
        </Muted>
        <div className="flex flex-col gap-1">
          {detail.members.map((member) => {
            const realName = (member.user as ConnectedUser).realName;
            return (
              <div
                key={member.user.id}
                className="flex items-baseline gap-[7px] rounded-[9px] border bg-card px-[11px] py-[9px]"
              >
                <span className="font-semibold">
                  {/* 성립 후 참여자에게만 실명이 온다(docs/12 §6) */}
                  {realName || member.user.displayName}
                </span>
                {member.isMe && <Tag>나</Tag>}
                {member.user.displayNameType === 'REAL' && !realName && (
                  <Tag>실명</Tag>
                )}
                <span className="ml-auto text-xs whitespace-nowrap text-muted-foreground">
                  {member.decision === 'JOINED'
                    ? `참여 ${member.joinOrder}번째`
                    : '미정'}
                </span>
              </div>
            );
          })}
        </div>
      </OverlaySection>

      {/* 가장 먼저 참여하면 시작자가 된다. 참여를 막지 않되 알린다(docs/10 §5, OQ-12) */}
      {confirming && (
        <OverlaySection>
          <Notice>
            가장 먼저 참여하면 성립 시 대화를 시작하는 역할을 맡습니다. 메신저에서
            그룹 대화를 열고 초대하는 것까지이며, 첫 발언까지 하실 필요는 없습니다.
          </Notice>
        </OverlaySection>
      )}

      {error && <ErrorText className="mt-3">{error}</ErrorText>}

      <OverlayActions>
        {activated ? (
          <>
            <Button
              type="button"
              className="flex-1"
              disabled={marked || !detail.action}
              onClick={async () => {
                await api.post(`/networks/${detail.id}/mark-invited`);
                setMarked(true);
              }}
            >
              {marked ? '표시함 ✓' : (detail.action?.buttonLabel ?? '확인')}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              닫기
            </Button>
          </>
        ) : joined ? (
          <>
            <Button type="button" variant="outline" className="flex-1" disabled>
              참여 의사를 표시했습니다
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void act('leave')}
            >
              철회
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              className="flex-1"
              disabled={busy}
              onClick={() =>
                detail.wouldBeInitiator && !confirming
                  ? setConfirming(true)
                  : void act('join')
              }
            >
              {confirming ? '네, 참여합니다' : '연결하기'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void act('decline')}
            >
              거절
            </Button>
          </>
        )}
      </OverlayActions>
    </ResponsiveDialog>
  );
}

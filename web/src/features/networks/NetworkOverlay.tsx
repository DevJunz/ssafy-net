import type { ConnectedUser, NetworkDetail } from '@ssafy-net/shared';
import { useEffect, useState } from 'react';
import { api, RequestFailed } from '../../api/client';

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
  const [copied, setCopied] = useState(false);
  const [marked, setMarked] = useState(detail.started);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
    <div className="overlay-backdrop" onClick={onClose}>
      <div
        className="overlay"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{activated ? '네트워크가 성립되었습니다' : '추천 네트워크'}</h2>
        {/* 이유가 완전해야 한다: 개수와 이름을 전부 보여준다(docs/13 원칙 3) */}
        <p className="muted">{detail.reason}</p>

        <div className="section">
          <div className="chips">
            {detail.commonInterests.map((interest) => (
              <span key={interest.id} className="chip selected">
                {interest.name}
              </span>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
            {detail.snapshotNote}
          </p>
        </div>

        {activated && detail.action && (
          <div className="section action-box">
            <div className="headline">{detail.action.text}</div>
            <div className="copy-row">
              <code>{detail.action.copyText}</code>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(detail.action!.copyText);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? '복사됨' : '전체 복사'}
              </button>
            </div>
          </div>
        )}

        <div className="section">
          <div className="muted" style={{ marginBottom: 8 }}>
            멤버 {detail.members.length}명 · {detail.joinedCount}명 참여 ·{' '}
            {detail.requiredCount}명이 되면 성립
            {!activated && ` · ${detail.daysLeft}일 남음`}
          </div>
          <div className="list">
            {detail.members.map((member) => {
              const realName = (member.user as ConnectedUser).realName;
              return (
                <div key={member.user.id} className="person-row">
                  <span className="name">
                    {/* 성립 후 참여자에게만 실명이 온다(docs/12 §6) */}
                    {realName || member.user.displayName}
                  </span>
                  {member.isMe && <span className="badge">나</span>}
                  {member.user.displayNameType === 'REAL' && !realName && (
                    <span className="badge">실명</span>
                  )}
                  <span className="meta">
                    {member.decision === 'JOINED'
                      ? `참여 ${member.joinOrder}번째`
                      : '미정'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 가장 먼저 참여하면 시작자가 된다. 참여를 막지 않되 알린다(docs/10 §5, OQ-12) */}
        {confirming && (
          <div className="section notice">
            가장 먼저 참여하면 성립 시 대화를 시작하는 역할을 맡습니다. 메신저에서
            그룹 대화를 열고 초대하는 것까지이며, 첫 발언까지 하실 필요는 없습니다.
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <div className="actions">
          {activated ? (
            <>
              <button
                type="button"
                className="primary grow"
                disabled={marked || !detail.action}
                onClick={async () => {
                  await api.post(`/networks/${detail.id}/mark-invited`);
                  setMarked(true);
                }}
              >
                {marked ? '표시함 ✓' : (detail.action?.buttonLabel ?? '확인')}
              </button>
              <button type="button" onClick={onClose}>
                닫기
              </button>
            </>
          ) : joined ? (
            <>
              <button type="button" className="grow" disabled>
                참여 의사를 표시했습니다
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act('leave')}
              >
                철회
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="primary grow"
                disabled={busy}
                onClick={() =>
                  detail.wouldBeInitiator && !confirming
                    ? setConfirming(true)
                    : void act('join')
                }
              >
                {confirming ? '네, 참여합니다' : '연결하기'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act('decline')}
              >
                거절
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

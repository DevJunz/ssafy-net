import type {
  ConnectionDetail,
  FollowUpItem,
  PublicUser,
  RequestDetail,
  RequestQuota,
} from '@ssafy-net/shared';
import { FOLLOW_UP_REASONS } from '@ssafy-net/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { api, RequestFailed } from '../../api/client';

function Overlay({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="overlay" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
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
    <Overlay onClose={onClose}>
      <h2>{target.displayName}님에게 연결 요청</h2>
      <p className="muted">
        상대가 수락하면 서로 실명이 공개됩니다.
      </p>

      <div className="section">
        {common.length > 0 ? (
          <>
            <div className="muted" style={{ marginBottom: 6 }}>
              공통 관심사 {common.length}개
            </div>
            <div className="chips">
              {common.map((interest) => (
                <span key={interest.id} className="chip selected">
                  {interest.name}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="notice">
            공통 관심사가 없습니다. 왜 이야기하고 싶은지 적어주세요.
          </div>
        )}
      </div>

      <div className="section">
        <textarea
          value={message}
          maxLength={limit}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="어떤 이야기를 나누고 싶은지 한두 문장이면 충분합니다."
        />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">
            {quota &&
              `오늘 ${quota.dailyLimit - quota.dailyUsed}번 더 보낼 수 있습니다`}
          </span>
          <span className="muted">
            {message.length} / {limit}
          </span>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="actions">
        <button
          type="button"
          className="primary grow"
          disabled={!message.trim() || sending}
          onClick={() => void send()}
        >
          보내기
        </button>
        <button type="button" onClick={onClose}>
          취소
        </button>
      </div>
    </Overlay>
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
      <Overlay onClose={onClose}>
        <h2>{error}</h2>
        <div className="actions">
          <button type="button" className="grow" onClick={onClose}>
            닫기
          </button>
        </div>
      </Overlay>
    );
  }

  if (!detail) {
    return (
      <Overlay onClose={onClose}>
        <p className="muted">불러오는 중…</p>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <h2>
        {detail.from.displayName}
        {detail.from.displayNameType === 'REAL' && (
          <span className="badge real" style={{ marginLeft: 8 }}>실명</span>
        )}
      </h2>
      <p className="muted">
        공통 관심사 {detail.commonInterests.length}개 · {detail.daysLeft}일 남음
      </p>

      <div className="section">
        <div className="quote">{detail.message}</div>
      </div>

      <div className="section">
        <div className="muted" style={{ marginBottom: 6 }}>
          {detail.from.displayName}님의 관심사
        </div>
        <div className="chips">
          {detail.from.interests.map((interest) => (
            <span
              key={interest.id}
              className={`chip ${interest.isCommon ? 'selected' : ''}`}
            >
              {interest.name}
            </span>
          ))}
        </div>
      </div>

      {/* 닉네임 사용자만 확인을 거친다. 수락은 실명 공개를 동반한다(docs/07 §3.3) */}
      {confirming ? (
        <div className="section notice">
          수락하면 내 실명(<strong>{detail.myRealName}</strong>)이 상대에게
          공개됩니다. 수락할까요?
        </div>
      ) : null}

      <div className="actions">
        <button
          type="button"
          className="primary grow"
          disabled={busy}
          onClick={() =>
            detail.revealsMyRealName && !confirming
              ? setConfirming(true)
              : void accept()
          }
        >
          {confirming ? '네, 수락합니다' : '수락'}
        </button>
        <button type="button" disabled={busy} onClick={() => void reject()}>
          거절
        </button>
      </div>
      {/* 거절 버튼 옆에 상시 표시한다(docs/07 §3.4) */}
      <p className="muted" style={{ marginTop: 8, textAlign: 'right' }}>
        거절은 상대에게 알려지지 않습니다.
      </p>
    </Overlay>
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
  const [copied, setCopied] = useState(false);
  const [marked, setMarked] = useState(detail.started);

  const copy = async () => {
    await navigator.clipboard.writeText(detail.action.copyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const mark = async () => {
    await api.post(`/connections/${detail.id}/mark-started`);
    setMarked(true);
    onMarked();
  };

  return (
    <Overlay onClose={onClose}>
      <h2>연결되었습니다</h2>
      <div className="big-name">{detail.counterpart.realName}</div>

      <div className="section action-box">
        <div className="headline">{detail.action.text}</div>
        <div className="copy-row">
          <code>{detail.action.copyText}</code>
          <button type="button" onClick={() => void copy()}>
            {copied ? '복사됨' : '복사'}
          </button>
        </div>
      </div>

      {detail.commonInterests.length > 0 && (
        <div className="section">
          <div className="muted" style={{ marginBottom: 6 }}>
            첫 대화 소재
          </div>
          <div className="chips">
            {detail.commonInterests.map((interest) => (
              <span key={interest.id} className="chip selected">
                {interest.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {detail.requestMessage && (
        <div className="section">
          <div className="muted" style={{ marginBottom: 6 }}>
            요청 메시지
          </div>
          <div className="quote">{detail.requestMessage}</div>
        </div>
      )}

      <div className="actions">
        <button
          type="button"
          className="primary grow"
          disabled={marked}
          onClick={() => void mark()}
        >
          {marked ? '표시함 ✓' : detail.action.buttonLabel}
        </button>
        <button type="button" onClick={onClose}>
          닫기
        </button>
      </div>
    </Overlay>
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
      <Overlay onClose={onClose}>
        <h2>{item.counterpartName}님에게 알릴까요?</h2>
        <p className="muted">
          "먼저 연락해주세요"라고 상대에게 알림을 보낼 수 있습니다.
        </p>
        <div className="actions">
          <button
            type="button"
            className="primary grow"
            onClick={() =>
              void respond({ started: false, reason: 'NOT_FOUND', askCounterpart: true })
            }
          >
            네, 알려주세요
          </button>
          <button
            type="button"
            onClick={() =>
              void respond({ started: false, reason: 'NOT_FOUND', askCounterpart: false })
            }
          >
            괜찮습니다
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <h2>{item.question}</h2>

      {reason === null ? (
        <div className="actions">
          <button
            type="button"
            className="primary grow"
            onClick={() => void respond({ started: true })}
          >
            예
          </button>
          <button type="button" className="grow" onClick={() => setReason('')}>
            아니오
          </button>
        </div>
      ) : (
        <div className="section list">
          <p className="muted">이유를 하나만 알려주세요.</p>
          {FOLLOW_UP_REASONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="card-row"
              onClick={() =>
                option.value === 'NOT_FOUND'
                  ? setAsking(true)
                  : void respond({ started: false, reason: option.value })
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </Overlay>
  );
}

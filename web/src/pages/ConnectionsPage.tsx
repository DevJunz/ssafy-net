import type {
  ConnectionDetail,
  ConnectionSummary,
  ReceivedRequestSummary,
  SentRequestSummary,
} from '@ssafy-net/shared';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import {
  ConnectionOverlay,
  RequestDetailOverlay,
} from '../features/connections/Overlays';

type Tab = 'received' | 'sent' | 'connected';

const SENT_LABEL: Record<SentRequestSummary['status'], string> = {
  PENDING: '응답 대기',
  NO_RESPONSE: '응답 없음',
  CANCELLED: '취소함',
  ACCEPTED: '연결됨',
};

/**
 * Connections (docs/05 §3.8, docs/06 §3.7).
 *
 * 요청 처리와 연결 관리는 그래프가 아니라 리스트다(D-03).
 * 수락 후 메신저로 넘어가는 유일한 통로이므로 여기가 끊기면 H5를 볼 수 없다.
 */
export function ConnectionsPage({ onChanged }: { onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>('received');
  const [received, setReceived] = useState<ReceivedRequestSummary[]>([]);
  const [sent, setSent] = useState<SentRequestSummary[]>([]);
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);

  const [openRequest, setOpenRequest] = useState<string | null>(null);
  const [openConnection, setOpenConnection] = useState<ConnectionDetail | null>(null);
  const [undo, setUndo] = useState<{ id: string; until: number } | null>(null);
  const [params, setParams] = useSearchParams();

  const reload = useCallback(async () => {
    const [r, s, c] = await Promise.all([
      api.get<ReceivedRequestSummary[]>('/connection-requests?box=received'),
      api.get<SentRequestSummary[]>('/connection-requests?box=sent'),
      api.get<ConnectionSummary[]>('/connections'),
    ]);
    setReceived(r);
    setSent(s);
    setConnections(c);
    onChanged();
  }, [onChanged]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /**
   * 알림에서 온 사람은 행동 화면에 바로 도착해야 한다(FR-14.4).
   * 홈으로 보내고 다시 찾게 하지 않는다.
   */
  useEffect(() => {
    const requestId = params.get('request');
    const connectionId = params.get('connection');
    if (!requestId && !connectionId) return;

    if (requestId) {
      setTab('received');
      setOpenRequest(requestId);
    } else if (connectionId) {
      setTab('connected');
      api
        .get<ConnectionDetail>(`/connections/${connectionId}`)
        .then(setOpenConnection)
        .catch(() => {});
    }
    setParams({}, { replace: true });
  }, [params, setParams]);

  // 거절 되돌리기는 5초만 열려 있다(docs/07 §3.4).
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), undo.until - Date.now());
    return () => clearTimeout(timer);
  }, [undo]);

  const openConnectionDetail = async (id: string) => {
    setOpenConnection(await api.get<ConnectionDetail>(`/connections/${id}`));
  };

  const cancel = async (id: string) => {
    await api.del(`/connection-requests/${id}`);
    await reload();
  };

  return (
    <div className="scroll-page">
      <main className="page" style={{ maxWidth: 760 }}>
        <h1 style={{ fontSize: 22, marginBottom: 18 }}>연결</h1>

        <div className="tabs">
          <button
            type="button"
            className={tab === 'received' ? 'on' : ''}
            onClick={() => setTab('received')}
          >
            받은 요청
            {received.length > 0 && <span className="count">{received.length}</span>}
          </button>
          <button
            type="button"
            className={tab === 'sent' ? 'on' : ''}
            onClick={() => setTab('sent')}
          >
            보낸 요청
          </button>
          <button
            type="button"
            className={tab === 'connected' ? 'on' : ''}
            onClick={() => setTab('connected')}
          >
            연결됨
          </button>
        </div>

        {tab === 'received' &&
          (received.length === 0 ? (
            <div className="notice">
              아직 받은 요청이 없습니다. 관심사를 늘리면 발견될 가능성이 높아집니다.
            </div>
          ) : (
            received.map((item) => (
              <button
                key={item.id}
                type="button"
                className="card-row"
                onClick={() => setOpenRequest(item.id)}
              >
                <div className="body">
                  <div className="title">
                    {item.from.displayName}
                    {item.from.displayNameType === 'REAL' && (
                      <span className="badge real">실명</span>
                    )}
                    <span className="badge">공통 {item.commonCount}개</span>
                  </div>
                  <div className="sub">{item.messagePreview}</div>
                </div>
                <div className="right">{item.daysLeft}일 남음</div>
              </button>
            ))
          ))}

        {tab === 'sent' &&
          (sent.length === 0 ? (
            <div className="notice">아직 보낸 요청이 없습니다.</div>
          ) : (
            sent.map((item) => (
              <div key={item.id} className="card-row">
                <div className="body">
                  <div className="title">{item.to.displayName}</div>
                  <div className="sub">
                    {new Date(item.createdAt).toLocaleDateString('ko-KR')} 보냄
                    {item.reRequestableAt &&
                      ` · ${new Date(item.reRequestableAt).toLocaleDateString('ko-KR')} 이후 다시 요청 가능`}
                  </div>
                </div>
                <div className="right">
                  {SENT_LABEL[item.status]}
                  {item.canCancel && (
                    <>
                      <br />
                      <button
                        type="button"
                        style={{ padding: '3px 9px', fontSize: 12, marginTop: 5 }}
                        onClick={() => void cancel(item.id)}
                      >
                        취소
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          ))}

        {tab === 'connected' &&
          (connections.length === 0 ? (
            <div className="notice">
              아직 연결된 사람이 없습니다. 그래프에서 나와 비슷한 사람을 찾아보세요.
            </div>
          ) : (
            connections.map((item) => (
              <button
                key={item.id}
                type="button"
                className="card-row"
                onClick={() => void openConnectionDetail(item.id)}
              >
                <div className="body">
                  <div className="title">
                    {item.counterpart.realName}
                    <span className="badge state">
                      {item.myRole === 'INITIATOR' ? '내가 먼저' : '상대가 먼저'}
                    </span>
                  </div>
                  <div className="sub">
                    {item.commonInterests.map((i) => i.name).join(' · ') ||
                      '공통 관심사 없음'}
                  </div>
                </div>
                <div className="right">
                  {item.started ? '시작함 ✓' : '아직'}
                  <br />
                  {new Date(item.establishedAt).toLocaleDateString('ko-KR')}
                </div>
              </button>
            ))
          ))}
      </main>

      {openRequest && (
        <RequestDetailOverlay
          requestId={openRequest}
          onClose={() => setOpenRequest(null)}
          onAccepted={(connection) => {
            setOpenRequest(null);
            setOpenConnection(connection);
            void reload();
          }}
          onRejected={(id, until) => {
            setOpenRequest(null);
            setUndo({ id, until: new Date(until).getTime() });
            void reload();
          }}
        />
      )}

      {openConnection && (
        <ConnectionOverlay
          detail={openConnection}
          onClose={() => setOpenConnection(null)}
          onMarked={() => void reload()}
        />
      )}

      {undo && (
        <div className="toast">
          요청을 거절했습니다. 상대에게는 알려지지 않습니다.
          <button
            type="button"
            onClick={async () => {
              await api.post(`/connection-requests/${undo.id}/reject/undo`);
              setUndo(null);
              await reload();
            }}
          >
            되돌리기
          </button>
        </div>
      )}
    </div>
  );
}

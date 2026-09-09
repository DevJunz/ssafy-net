import type {
  ConnectionDetail,
  ConnectionSummary,
  ReceivedRequestSummary,
  SentRequestSummary,
} from '@ssafy-net/shared';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '../api/client';
import {
  CardRow,
  CardRowBody,
  CardRowButton,
  CardRowRight,
  CardRowSub,
  CardRowTitle,
  Notice,
  Page,
  PageTitle,
  ScrollPage,
  Tag,
} from '../components/primitives';
import { SkeletonRows } from '../components/Skeleton';
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
  // 첫 응답이 오기 전에는 빈 상태 문구를 보여주지 않는다. "아직 없습니다"가 거짓이 된다.
  const [loading, setLoading] = useState(true);

  const [openRequest, setOpenRequest] = useState<string | null>(null);
  const [openConnection, setOpenConnection] = useState<ConnectionDetail | null>(null);
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
    setLoading(false);
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

  /** 거절 되돌리기는 서버가 준 시각까지만 열려 있다(docs/07 §3.4, 5초). 토스트가 그만큼만 떠 있다. */
  const offerUndo = (id: string, until: string) => {
    toast('요청을 거절했습니다. 상대에게는 알려지지 않습니다.', {
      duration: Math.max(1000, new Date(until).getTime() - Date.now()),
      action: {
        label: '되돌리기',
        onClick: () => {
          void (async () => {
            await api.post(`/connection-requests/${id}/reject/undo`);
            await reload();
          })();
        },
      },
    });
  };

  const openConnectionDetail = async (id: string) => {
    setOpenConnection(await api.get<ConnectionDetail>(`/connections/${id}`));
  };

  const cancel = async (id: string) => {
    await api.del(`/connection-requests/${id}`);
    await reload();
  };

  return (
    <ScrollPage>
      <Page>
        <PageTitle>연결</PageTitle>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as Tab)}
          className="mt-[18px] mb-5"
        >
          <TabsList
            variant="line"
            className="w-full justify-start border-b max-sm:overflow-x-auto max-sm:[scrollbar-width:none]"
          >
            <TabsTrigger value="received" className="flex-none px-3.5 py-2.5">
              받은 요청
              {received.length > 0 && (
                <span className="ml-0.5 text-[11px] font-bold text-destructive">
                  {received.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="sent" className="flex-none px-3.5 py-2.5">
              보낸 요청
            </TabsTrigger>
            <TabsTrigger value="connected" className="flex-none px-3.5 py-2.5">
              연결됨
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {loading && <SkeletonRows />}

        {!loading &&
          tab === 'received' &&
          (received.length === 0 ? (
            <Notice>
              아직 받은 요청이 없습니다. 관심사를 늘리면 발견될 가능성이 높아집니다.
            </Notice>
          ) : (
            received.map((item) => (
              <CardRowButton key={item.id} onClick={() => setOpenRequest(item.id)}>
                <CardRowBody>
                  <CardRowTitle>
                    {item.from.displayName}
                    {item.from.displayNameType === 'REAL' && <Tag tone="real">실명</Tag>}
                    <Tag>공통 {item.commonCount}개</Tag>
                  </CardRowTitle>
                  <CardRowSub>{item.messagePreview}</CardRowSub>
                </CardRowBody>
                <CardRowRight>{item.daysLeft}일 남음</CardRowRight>
              </CardRowButton>
            ))
          ))}

        {!loading &&
          tab === 'sent' &&
          (sent.length === 0 ? (
            <Notice>아직 보낸 요청이 없습니다.</Notice>
          ) : (
            sent.map((item) => (
              <CardRow key={item.id}>
                <CardRowBody>
                  <CardRowTitle>{item.to.displayName}</CardRowTitle>
                  <CardRowSub>
                    {new Date(item.createdAt).toLocaleDateString('ko-KR')} 보냄
                    {item.reRequestableAt &&
                      ` · ${new Date(item.reRequestableAt).toLocaleDateString('ko-KR')} 이후 다시 요청 가능`}
                  </CardRowSub>
                </CardRowBody>
                <CardRowRight>
                  {SENT_LABEL[item.status]}
                  {item.canCancel && (
                    <>
                      <br />
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        className="mt-1"
                        onClick={() => void cancel(item.id)}
                      >
                        취소
                      </Button>
                    </>
                  )}
                </CardRowRight>
              </CardRow>
            ))
          ))}

        {!loading &&
          tab === 'connected' &&
          (connections.length === 0 ? (
            <Notice>
              아직 연결된 사람이 없습니다. 그래프에서 나와 비슷한 사람을 찾아보세요.
            </Notice>
          ) : (
            connections.map((item) => (
              <CardRowButton key={item.id} onClick={() => void openConnectionDetail(item.id)}>
                <CardRowBody>
                  <CardRowTitle>
                    {item.counterpart.realName}
                    <Tag tone="state">
                      {item.myRole === 'INITIATOR' ? '내가 먼저' : '상대가 먼저'}
                    </Tag>
                  </CardRowTitle>
                  <CardRowSub>
                    {item.commonInterests.map((i) => i.name).join(' · ') ||
                      '공통 관심사 없음'}
                  </CardRowSub>
                </CardRowBody>
                <CardRowRight>
                  {item.started ? '시작함 ✓' : '아직'}
                  <br />
                  {new Date(item.establishedAt).toLocaleDateString('ko-KR')}
                </CardRowRight>
              </CardRowButton>
            ))
          ))}
      </Page>

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
            offerUndo(id, until);
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
    </ScrollPage>
  );
}

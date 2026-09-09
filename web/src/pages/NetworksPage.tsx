import type { NetworkDetail, NetworkSummary } from '@ssafy-net/shared';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '../api/client';
import {
  CardRowBody,
  CardRowButton,
  CardRowRight,
  CardRowSub,
  CardRowTitle,
  Notice,
  Page,
  PageLede,
  PageTitle,
  ScrollPage,
} from '../components/primitives';
import { SkeletonRows } from '../components/Skeleton';
import { NetworkOverlay } from '../features/networks/NetworkOverlay';

type Tab = 'recommended' | 'joined' | 'activated';

const TABS: { key: Tab; label: string }[] = [
  { key: 'recommended', label: '추천' },
  { key: 'joined', label: '참여 대기' },
  { key: 'activated', label: '성립됨' },
];

/**
 * Networks (docs/05 §3.9).
 *
 * Network는 "전원이 여러 관심사를 함께 공유하는 3~6명의 그룹 후보"다.
 * 추천은 후보일 뿐이고, 각자가 참여를 선택해 [P-09]명이 모이면 성립한다.
 */
export function NetworksPage({ onChanged }: { onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>('recommended');
  const [items, setItems] = useState<NetworkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<NetworkDetail | null>(null);
  const [params, setParams] = useSearchParams();

  const reload = useCallback(async () => {
    setLoading(true);
    setItems(await api.get<NetworkSummary[]>(`/networks?tab=${tab}`));
    setLoading(false);
    onChanged();
  }, [tab, onChanged]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** 알림에서 온 사람은 그 추천을 바로 열어야 한다(FR-14.4). */
  useEffect(() => {
    const id = params.get('open');
    const wanted = params.get('tab');
    if (wanted === 'recommended' || wanted === 'joined' || wanted === 'activated') {
      setTab(wanted);
    }
    if (id) {
      api.get<NetworkDetail>(`/networks/${id}`).then(setOpen).catch(() => {});
    }
    if (id || wanted) setParams({}, { replace: true });
  }, [params, setParams]);

  const openDetail = async (id: string) => {
    setOpen(await api.get<NetworkDetail>(`/networks/${id}`));
  };

  return (
    <ScrollPage>
      <Page>
        <PageTitle>네트워크</PageTitle>
        <PageLede>
          여러 관심사를 함께 공유하는 3~6명의 그룹입니다. 참여한 사람이 3명이
          되면 성립합니다.
        </PageLede>

        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="mb-5">
          <TabsList
            variant="line"
            className="w-full justify-start border-b max-sm:overflow-x-auto max-sm:[scrollbar-width:none]"
          >
            {TABS.map((item) => (
              <TabsTrigger key={item.key} value={item.key} className="flex-none px-3.5 py-2.5">
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <SkeletonRows />
        ) : items.length === 0 ? (
          <Notice>
            {tab === 'recommended'
              ? '아직 나에게 맞는 네트워크가 없습니다. 관심사를 더 고르면 생길 수 있습니다.'
              : tab === 'joined'
                ? '참여 대기 중인 네트워크가 없습니다.'
                : '아직 성립된 네트워크가 없습니다.'}
          </Notice>
        ) : (
          items.map((item) => (
            <CardRowButton key={item.id} onClick={() => void openDetail(item.id)}>
              <CardRowBody>
                <CardRowTitle>{item.reason}</CardRowTitle>
                <CardRowSub>
                  {item.commonInterests.map((i) => i.name).join(' · ')}
                </CardRowSub>
              </CardRowBody>
              <CardRowRight>
                {item.status === 'ACTIVATED' ? (
                  '성립됨'
                ) : (
                  <>
                    {item.joinedCount}/{item.requiredCount}명 참여
                    <br />
                    {item.daysLeft}일 남음
                  </>
                )}
              </CardRowRight>
            </CardRowButton>
          ))
        )}
      </Page>

      {open && (
        <NetworkOverlay
          detail={open}
          onClose={() => setOpen(null)}
          onChanged={(next) => {
            setOpen(next);
            void reload();
          }}
        />
      )}
    </ScrollPage>
  );
}

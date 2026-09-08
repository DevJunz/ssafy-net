import type { NetworkDetail, NetworkSummary } from '@ssafy-net/shared';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
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
  const [open, setOpen] = useState<NetworkDetail | null>(null);

  const reload = useCallback(async () => {
    setItems(await api.get<NetworkSummary[]>(`/networks?tab=${tab}`));
    onChanged();
  }, [tab, onChanged]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openDetail = async (id: string) => {
    setOpen(await api.get<NetworkDetail>(`/networks/${id}`));
  };

  return (
    <div className="scroll-page">
      <main className="page" style={{ maxWidth: 760 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>네트워크</h1>
        <p className="muted">
          여러 관심사를 함께 공유하는 3~6명의 그룹입니다. 참여한 사람이 3명이
          되면 성립합니다.
        </p>

        <div className="tabs" style={{ marginTop: 18 }}>
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={tab === item.key ? 'on' : ''}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="notice">
            {tab === 'recommended'
              ? '아직 나에게 맞는 네트워크가 없습니다. 관심사를 더 고르면 생길 수 있습니다.'
              : tab === 'joined'
                ? '참여 대기 중인 네트워크가 없습니다.'
                : '아직 성립된 네트워크가 없습니다.'}
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="card-row"
              onClick={() => void openDetail(item.id)}
            >
              <div className="body">
                <div className="title">{item.reason}</div>
                <div className="sub">
                  {item.commonInterests.map((i) => i.name).join(' · ')}
                </div>
              </div>
              <div className="right">
                {item.status === 'ACTIVATED' ? (
                  '성립됨'
                ) : (
                  <>
                    {item.joinedCount}/{item.requiredCount}명 참여
                    <br />
                    {item.daysLeft}일 남음
                  </>
                )}
              </div>
            </button>
          ))
        )}
      </main>

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
    </div>
  );
}

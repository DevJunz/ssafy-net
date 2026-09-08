import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

interface NotificationItem {
  id: string;
  type: string;
  text: string;
  targetPath: string;
  actionRequired: boolean;
  resolved: boolean;
  readAt: string | null;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

/**
 * 알림함 (docs/05 §3.10, docs/06 §3.9).
 *
 * 나에게 온 것을 모아 보고 **바로 처리한다**. 항목을 누르면 홈이 아니라
 * 행동 화면으로 직행한다(FR-14.4).
 *
 * 처리가 필요한 것은 위에 고정한다. 배지가 0이면 여기 할 일이 없다는 뜻이다(D-31).
 */
export function NotificationsPage({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const reload = useCallback(async () => {
    setItems(await api.get<NotificationItem[]>('/notifications'));
    setLoading(false);
    onChanged();
  }, [onChanged]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const open = async (item: NotificationItem) => {
    if (!item.readAt) await api.post(`/notifications/${item.id}/read`);
    navigate(item.targetPath);
    onChanged();
  };

  // 처리가 필요한 것을 위로 (docs/06 §3.9)
  const pending = items.filter((item) => item.actionRequired && !item.resolved);
  const rest = items.filter((item) => !item.actionRequired || item.resolved);

  const Row = ({ item }: { item: NotificationItem }) => (
    <button
      type="button"
      className="card-row"
      onClick={() => void open(item)}
      style={item.readAt ? { opacity: 0.66 } : undefined}
    >
      <div className="body">
        <div className="sub" style={{ whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
          {/* 서버가 만든 문구를 그대로 쓴다. 판단 근거가 이미 들어 있다(FR-14.3) */}
          {item.text.replace(/\*\*/g, '').replace(/^> /gm, '“').trim()}
        </div>
      </div>
      <div className="right">
        {item.actionRequired && !item.resolved && (
          <span className="badge state">처리 필요</span>
        )}
        <br />
        {timeAgo(item.createdAt)}
      </div>
    </button>
  );

  return (
    <div className="scroll-page">
      <main className="page" style={{ maxWidth: 760 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>알림</h1>
        <p className="muted">
          알림은 Mattermost로도 갑니다. 여기서도 언제든 다시 볼 수 있습니다.
        </p>

        {loading ? (
          <p className="muted">불러오는 중…</p>
        ) : items.length === 0 ? (
          <div className="notice" style={{ marginTop: 20 }}>
            아직 알림이 없습니다. 누군가 연결을 요청하면 여기와 Mattermost로
            알려드립니다.
          </div>
        ) : (
          <>
            {pending.length > 0 && (
              <div className="section">
                <div className="rail-title" style={{ margin: '0 0 8px' }}>
                  처리가 필요한 것
                </div>
                {pending.map((item) => (
                  <Row key={item.id} item={item} />
                ))}
              </div>
            )}

            {rest.length > 0 && (
              <div className="section">
                {pending.length > 0 && (
                  <div className="rail-title" style={{ margin: '0 0 8px' }}>
                    지난 알림
                  </div>
                )}
                {rest.map((item) => (
                  <Row key={item.id} item={item} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

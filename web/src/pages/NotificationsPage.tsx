import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { api } from '../api/client';
import {
  CardRowBody,
  CardRowButton,
  CardRowRight,
  Notice,
  Page,
  PageLede,
  PageTitle,
  ScrollPage,
  SectionLabel,
  Tag,
} from '../components/primitives';
import { SkeletonRows } from '../components/Skeleton';

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
    // 읽은 알림은 흐리게 두되 목록에서 지우지 않는다
    <CardRowButton
      className={cn(item.readAt && 'opacity-[0.66]')}
      onClick={() => void open(item)}
    >
      <CardRowBody>
        {/* 알림 문장. 서버가 완성한 문구를 줄바꿈 그대로 보여준다(FR-14.3) */}
        <div className="text-sm leading-normal whitespace-pre-wrap text-foreground">
          {item.text.replace(/\*\*/g, '').replace(/^> /gm, '“').trim()}
        </div>
      </CardRowBody>
      <CardRowRight>
        {item.actionRequired && !item.resolved && <Tag tone="state">처리 필요</Tag>}
        <br />
        {timeAgo(item.createdAt)}
      </CardRowRight>
    </CardRowButton>
  );

  return (
    <ScrollPage>
      <Page>
        <PageTitle>알림</PageTitle>
        <PageLede>
          알림은 Mattermost로도 갑니다. 여기서도 언제든 다시 볼 수 있습니다.
        </PageLede>

        {loading ? (
          <SkeletonRows count={4} />
        ) : items.length === 0 ? (
          <Notice>
            아직 알림이 없습니다. 누군가 연결을 요청하면 여기와 Mattermost로
            알려드립니다.
          </Notice>
        ) : (
          <>
            {pending.length > 0 && (
              <div className="mt-6">
                <SectionLabel>처리가 필요한 것</SectionLabel>
                {pending.map((item) => (
                  <Row key={item.id} item={item} />
                ))}
              </div>
            )}

            {rest.length > 0 && (
              <div className="mt-6">
                {pending.length > 0 && <SectionLabel>지난 알림</SectionLabel>}
                {rest.map((item) => (
                  <Row key={item.id} item={item} />
                ))}
              </div>
            )}
          </>
        )}
      </Page>
    </ScrollPage>
  );
}

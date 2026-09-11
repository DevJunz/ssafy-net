import type { NotificationPrefs } from '@ssafy-net/shared';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '../../api/client';
import { Muted } from '../../components/primitives';

const errorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

/**
 * 알림 받기 설정 (FR-14.2, My Profile).
 *
 * 메신저(Mattermost) DM 만 끈다 — **앱 내 알림함은 끌 수 없다.** 채널이 메신저 하나뿐이라
 * 그것마저 끄면 연결 요청이 온 것을 알 길이 없어진다(D-67).
 *
 * 둘로 나누는 이유: "아침 9시 묶음은 성가신데 연결 요청은 바로 알고 싶다" 가 가장 흔한 요구다.
 */
const ROWS: {
  key: keyof NotificationPrefs;
  title: string;
  detail: string;
}[] = [
  {
    key: 'immediate',
    title: '나에게 온 것',
    detail: '연결 요청·수락, 네트워크 추천과 성립, 후속 확인. 받으면 바로 갑니다',
  },
  {
    key: 'digest',
    title: '아침 묶음',
    detail: '매일 아침 9시에 새 소식을 모아 한 번. 보낼 것이 없는 날은 오지 않습니다',
  },
];

export function NotificationPrefsForm() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [busy, setBusy] = useState<keyof NotificationPrefs | null>(null);

  useEffect(() => {
    api
      .get<NotificationPrefs>('/me/notifications')
      .then(setPrefs)
      .catch((cause) => toast.error(errorText(cause)));
  }, []);

  const toggle = async (key: keyof NotificationPrefs) => {
    if (!prefs) return;
    const next = !prefs[key];
    setBusy(key);
    try {
      const saved = await api.patch<NotificationPrefs>('/me/notifications', {
        [key]: next,
      });
      setPrefs(saved);
      toast.success(next ? '메신저로 다시 보내드립니다' : '메신저로는 보내지 않습니다');
    } catch (cause) {
      toast.error(errorText(cause));
    } finally {
      setBusy(null);
    }
  };

  if (!prefs) return <Skeleton className="mt-3 h-[92px]" />;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {ROWS.map((row) => {
        const on = prefs[row.key];
        return (
          <div
            key={row.key}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border bg-card px-4 py-3 shadow-xs"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-medium">
                {row.title}
                <Badge variant={on ? 'default' : 'secondary'}>
                  {on ? '메신저로 받는 중' : '앱에만'}
                </Badge>
              </div>
              <Muted className="mt-0.5 text-[13px]">{row.detail}</Muted>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void toggle(row.key)}
            >
              {on ? '메신저 끄기' : '메신저로 받기'}
            </Button>
          </div>
        );
      })}
      <Muted className="text-[12.5px]">
        어느 쪽을 꺼도 앱의 알림함에는 그대로 쌓입니다. 알림함은 끌 수 없습니다.
      </Muted>
    </div>
  );
}

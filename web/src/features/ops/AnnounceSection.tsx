import type { OpsAnnouncement, OpsAnnounceResult } from '@ssafy-net/shared';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api } from '../../api/client';
import { Muted } from '../../components/primitives';
import { ResponsiveDialog, OverlayActions } from '../../components/ResponsiveDialog';
import { Section } from './charts';

const errorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

const BODY_MAX = 1000;
const TITLE_MAX = 40;

const when = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/**
 * 전체 공지 (운영자 → 온보딩을 마친 전원).
 *
 * 알림함에는 모두에게 남고, 메신저 DM 은 "나에게 온 것" 알림을 켜 둔 사람에게만 간다.
 * 되돌릴 수 없으므로 보내기 전에 갈 모습 그대로 한 번 보여주고 확인을 받는다.
 */
export function AnnounceSection({ activeUsers }: { activeUsers: number }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetPath, setTargetPath] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<OpsAnnouncement[] | null>(null);

  const load = async () => {
    try {
      setSent(await api.get<OpsAnnouncement[]>('/admin/ops/announcements'));
    } catch (cause) {
      toast.error(errorText(cause));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const send = async () => {
    setBusy(true);
    try {
      const result = await api.post<OpsAnnounceResult>('/admin/ops/announce', {
        title: title.trim() || undefined,
        body: body.trim(),
        targetPath: targetPath.trim() || undefined,
      });
      toast.success(
        `${result.recipients}명에게 보냈습니다 (메신저 ${result.messenger}명 · 앱에만 ${result.appOnly}명)`,
      );
      setTitle('');
      setBody('');
      setTargetPath('');
      setConfirming(false);
      await load();
    } catch (cause) {
      toast.error(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const ready = body.trim().length > 0;

  return (
    <Section
      title="공지 보내기"
      description="온보딩을 마친 전원의 알림함에 남긴다. 메신저 DM 은 '나에게 온 것' 알림을 켜 둔 사람에게만 간다 — 끈 사람도 앱에서는 읽는다. 되돌릴 수 없다"
    >
      <div className="flex flex-col gap-2">
        <Input
          value={title}
          maxLength={TITLE_MAX}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="제목 (선택)"
        />
        <Textarea
          value={body}
          maxLength={BODY_MAX}
          rows={4}
          onChange={(event) => setBody(event.target.value)}
          placeholder="공지 내용. 메신저 DM 에는 이 글이 그대로 나갑니다."
        />
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={targetPath}
            onChange={(event) => setTargetPath(event.target.value)}
            placeholder="누르면 갈 화면 (선택, 예: /networks)"
            className="w-[280px] max-w-full"
          />
          <Muted className="text-[12.5px]">
            {body.trim().length}/{BODY_MAX}자 · 비우면 홈으로 갑니다
          </Muted>
          <Button
            type="button"
            className="ml-auto"
            disabled={!ready || busy}
            onClick={() => setConfirming(true)}
          >
            보내기 전에 확인
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Muted className="text-[12.5px] font-semibold">보낸 공지</Muted>
        {!sent ? (
          <Skeleton className="h-[44px]" />
        ) : sent.length === 0 ? (
          <Muted className="text-[12.5px]">아직 보낸 공지가 없습니다.</Muted>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {sent.map((item) => (
              <li key={item.id} className="rounded-md border px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  {item.title && <span className="font-medium">{item.title}</span>}
                  <Muted className="text-[12.5px]">{when(item.sentAt)}</Muted>
                  <Muted className="ml-auto text-[12.5px]">
                    알림함 {item.recipients}명 · 메신저 {item.messenger}명
                  </Muted>
                </div>
                <div className="mt-0.5 line-clamp-2 text-[13px] whitespace-pre-wrap">
                  {item.body}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirming && (
        <ResponsiveDialog
          title="이 내용으로 보낼까요?"
          description={`활성 사용자 ${activeUsers}명의 알림함에 남고, 메신저 알림을 켜 둔 사람에게 DM 이 갑니다. 되돌릴 수 없습니다.`}
          onClose={() => (busy ? undefined : setConfirming(false))}
        >
          <div className="mt-4 rounded-xl border bg-secondary/50 px-4 py-3">
            {title.trim() && <div className="font-semibold">{title.trim()}</div>}
            <div className="mt-1 text-[14px] whitespace-pre-wrap">{body.trim()}</div>
          </div>
          <Muted className="mt-2 text-[12.5px]">
            누르면 가는 곳: {targetPath.trim() || '/'} · 발송은 동시 5건으로 나갑니다(1,000명이면 몇 분)
          </Muted>
          <OverlayActions>
            <Button type="button" disabled={busy} onClick={() => void send()}>
              전원에게 보내기
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              취소
            </Button>
          </OverlayActions>
        </ResponsiveDialog>
      )}
    </Section>
  );
}

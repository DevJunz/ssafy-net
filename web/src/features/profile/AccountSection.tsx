import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api } from '../../api/client';
import { Muted } from '../../components/primitives';
import {
  OverlayActions,
  ResponsiveDialog,
} from '../../components/ResponsiveDialog';
import { useSession } from '../../session';

const errorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

/**
 * 계정 (docs/06 §3.11).
 *
 * 로그아웃과 탈퇴. 탈퇴는 되돌릴 수 없으므로 무엇이 사라지는지 보여 주고 한 번 더 묻는다(07 §되돌릴 수 없는 것).
 * 끝나면 세션이 없어지므로 화면 상태를 고치지 않고 통째로 다시 연다.
 */
export function AccountSection() {
  const { me } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const leave = async (path: '/auth/logout' | '/me/withdraw') => {
    setBusy(true);
    try {
      await api.post(path);
      // 세션이 사라졌다. 남은 화면 상태를 쓰지 않도록 처음부터 다시 연다.
      window.location.href = '/';
    } catch (cause) {
      toast.error(errorText(cause));
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-[15px]">
          {me?.email ?? <span className="text-muted-foreground">계정 정보 없음</span>}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void leave('/auth/logout')}
        >
          로그아웃
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          탈퇴
        </Button>
      </div>

      {confirming && (
        <ResponsiveDialog
          title="정말 탈퇴할까요?"
          description="되돌릴 수 없습니다."
          onClose={() => (busy ? undefined : setConfirming(false))}
        >
          <ul className="mt-4 flex list-disc flex-col gap-1 pl-5 text-[14px]">
            <li>관심사와 그래프에서의 내 자리가 사라집니다</li>
            <li>내가 쓴 글, 진행 중인 연결 요청과 주고받은 메시지가 지워집니다</li>
            <li>알림과 알림 설정이 지워집니다</li>
            <li>
              이미 성립된 연결은 상대의 목록에 <b>탈퇴한 사용자</b>로 남습니다 — 실명은
              지워집니다
            </li>
          </ul>
          <Muted className="mt-3 text-[13px]">
            같은 Google 계정으로 다시 가입할 수 있지만, 이전 데이터는 돌아오지 않습니다.
          </Muted>
          <OverlayActions>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void leave('/me/withdraw')}
            >
              탈퇴하기
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              그만두기
            </Button>
          </OverlayActions>
        </ResponsiveDialog>
      )}
    </>
  );
}

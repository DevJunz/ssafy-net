import { PROFILE_MESSAGE_MAX } from '@ssafy-net/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RequestFailed } from '../../api/client';
import { ErrorText, Muted } from '../../components/primitives';

/**
 * 프로필 메시지 (D-85). 사람 패널에서 표시명 아래에 보이는 한 줄이다.
 * "무엇을 이야기하고 싶은지"를 미리 적어 두면 요청 메시지를 쓰는 쪽의 부담이 준다.
 * 비우고 저장하면 지워진다.
 */
export function ProfileMessageForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string | null;
  onSubmit: (message: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [message, setMessage] = useState(initial ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmed = message.trim();
  const unchanged = trimmed === (initial ?? '');
  const tooManyLines = trimmed.split(/\r?\n/).length > 2;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (e) {
      setError(e instanceof RequestFailed ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        value={message}
        maxLength={PROFILE_MESSAGE_MAX}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="예: 주말 아침 한강 러닝 같이 하실 분 찾아요. 사이드 프로젝트 이야기도 환영."
        className="min-h-[72px] bg-card"
      />
      <div className="flex items-center justify-between">
        <Muted className="text-xs">
          연결 전에도 누구에게나 보입니다. 줄바꿈은 한 번까지.
        </Muted>
        <Muted className="text-xs">
          {message.length} / {PROFILE_MESSAGE_MAX}
        </Muted>
      </div>
      {tooManyLines && <ErrorText>줄바꿈은 한 번까지만 쓸 수 있습니다.</ErrorText>}
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={unchanged || tooManyLines || saving}
          onClick={() => void submit()}
        >
          {trimmed ? '저장' : '지우기'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  );
}

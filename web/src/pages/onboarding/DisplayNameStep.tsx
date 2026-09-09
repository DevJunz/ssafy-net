import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Toggle } from '@/components/ui/toggle';
import { api, RequestFailed } from '../../api/client';
import { ErrorText, Muted } from '../../components/primitives';

const NICKNAME_ERRORS: Record<string, string> = {
  NICKNAME_TAKEN: '이미 사용 중인 닉네임입니다.',
  NICKNAME_LOOKS_LIKE_REAL_NAME:
    '다른 구성원의 실명과 비슷한 닉네임은 쓸 수 없습니다.',
  NICKNAME_INVALID: '사용할 수 없는 닉네임입니다. 2~12자로 지어주세요.',
};

/** 두 선택지가 같은 크기의 카드다. 고르면 테두리가 파랗게 된다. */
const choiceClass =
  'h-auto w-full flex-col items-start gap-1 rounded-xl border bg-card px-5 py-[18px] text-left font-normal whitespace-normal hover:border-input hover:bg-card hover:text-foreground hover:shadow-xs data-[state=on]:border-primary data-[state=on]:bg-accent data-[state=on]:text-foreground data-[state=on]:ring-1 data-[state=on]:ring-primary';

/**
 * 표시명 선택 (docs/06 §3.1.3).
 *
 * 두 선택지를 같은 크기로 두고, 어느 쪽도 기본값으로 밀지 않는다(J0 Decision Point).
 * 대신 각 선택이 무엇을 뜻하는지 결과로 설명한다.
 */
export function DisplayNameStep({
  realNamePreview,
  onDone,
}: {
  realNamePreview: string | null;
  onDone: () => void;
}) {
  const [type, setType] = useState<'NICKNAME' | 'REAL' | null>(null);
  const [nickname, setNickname] = useState('');
  const [check, setCheck] = useState<{ ok: boolean; code?: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (type !== 'NICKNAME' || nickname.trim().length < 2) {
      setCheck(null);
      return;
    }
    const timer = setTimeout(() => {
      api
        .get<{ ok: boolean; code?: string }>(
          `/onboarding/nickname-check?value=${encodeURIComponent(nickname.trim())}`,
        )
        .then(setCheck)
        .catch(() => setCheck(null));
    }, 250);
    return () => clearTimeout(timer);
  }, [type, nickname]);

  const submit = async () => {
    if (!type) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(
        '/onboarding/display-name',
        type === 'REAL' ? { type } : { type, nickname: nickname.trim() },
      );
      onDone();
    } catch (e) {
      setError(e instanceof RequestFailed ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    type === 'REAL' || (type === 'NICKNAME' && check?.ok === true);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl">다른 사람에게 어떻게 보일까요?</h2>

      <Toggle
        pressed={type === 'NICKNAME'}
        className={choiceClass}
        onClick={() => setType('NICKNAME')}
      >
        <strong className="block text-[15.5px] font-semibold">닉네임으로 활동</strong>
        <span className="text-sm text-muted-foreground">
          연결 전에는 닉네임만 보입니다. 수락하면 실명이 공개됩니다.
        </span>
      </Toggle>

      {type === 'NICKNAME' && (
        <div className="flex flex-col gap-4">
          <Input
            type="text"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="달리기왕"
            maxLength={12}
            className="h-11 bg-card"
          />
          {check?.ok === false && (
            <ErrorText>
              {NICKNAME_ERRORS[check.code ?? ''] ?? '사용할 수 없습니다.'}
            </ErrorText>
          )}
          {check?.ok === true && <Muted>사용할 수 있는 닉네임입니다.</Muted>}
        </div>
      )}

      <Toggle
        pressed={type === 'REAL'}
        className={choiceClass}
        onClick={() => setType('REAL')}
      >
        <strong className="block text-[15.5px] font-semibold">
          실명으로 활동 {realNamePreview && `(${realNamePreview})`}
        </strong>
        <span className="text-sm text-muted-foreground">
          처음부터 실명이 보입니다. 실명 표시가 붙습니다.
        </span>
      </Toggle>

      <Muted>나중에 바꿀 수 있습니다.</Muted>

      {error && <ErrorText>{error}</ErrorText>}

      <Button
        type="button"
        size="lg"
        className="self-start"
        disabled={!canSubmit || saving}
        onClick={() => void submit()}
      >
        다음
      </Button>
    </div>
  );
}

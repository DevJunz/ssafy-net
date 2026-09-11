import type { DisplayNameInput, DisplayNameType } from '@ssafy-net/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Toggle } from '@/components/ui/toggle';
import { api, RequestFailed } from '../../api/client';
import { ErrorText, Muted, Notice } from '../../components/primitives';

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
 * 표시명 선택 폼. 온보딩 2단계(docs/06 §3.1.3)와 My Profile 의 변경(§3.10)이 같은 폼을 쓴다.
 *
 * 두 선택지를 같은 크기로 두고, 어느 쪽도 기본값으로 밀지 않는다(J0 Decision Point).
 * 대신 각 선택이 무엇을 뜻하는지 결과로 설명한다.
 *
 * 입력 중 검사는 온보딩의 `GET /onboarding/nickname-check` 를 쓴다. 지금 쓰는 닉네임과
 * 같으면 검사하지 않고 저장 버튼도 잠근다 — 같은 값을 저장해 하루 1회를 쓰지 않게.
 *
 * **저장 버튼을 이 검사에 걸지 않는다.** 검사는 힌트일 뿐이고 최종 판정은 서버가 한다
 * (`NICKNAME_TAKEN` · `NICKNAME_LOOKS_LIKE_REAL_NAME` · `NICKNAME_INVALID` 를 그대로 돌려준다).
 * 검사가 느리거나 실패했을 때 버튼이 이유 없이 죽어 있으면 사용자는 무엇을 고쳐야 할지 알 수 없다 —
 * 그래서 "확실히 안 되는 것"(검사가 거부했거나 하루 1회에 걸렸거나 값이 그대로)만 막는다.
 */
export function DisplayNameForm({
  realNamePreview,
  initial,
  submitLabel,
  note,
  blockedReason,
  onSubmit,
  onCancel,
}: {
  realNamePreview: string | null;
  /** 지금 값. 있으면 그 값으로 시작하고, 같은 값이면 저장 버튼이 잠긴다 */
  initial?: { type: DisplayNameType; nickname: string | null };
  submitLabel: string;
  /** 버튼 위의 안내 한 줄 */
  note?: ReactNode;
  /** 있으면 저장을 막고 이 문구를 보여 준다(하루 1회 규칙) */
  blockedReason?: string | null;
  onSubmit: (input: DisplayNameInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [type, setType] = useState<DisplayNameType | null>(initial?.type ?? null);
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  /** idle 검사 안 함 · checking 확인 중 · ok 가능 · bad 거부 · unknown 확인 실패(저장은 열어 둔다) */
  const [check, setCheck] = useState<{
    status: 'idle' | 'checking' | 'ok' | 'bad' | 'unknown';
    code?: string;
  }>({ status: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmed = nickname.trim();
  const unchanged =
    initial !== undefined &&
    type === initial.type &&
    (type === 'REAL' || trimmed === (initial.nickname ?? ''));

  useEffect(() => {
    if (type !== 'NICKNAME' || trimmed.length < 2 || unchanged) {
      setCheck({ status: 'idle' });
      return;
    }
    setCheck({ status: 'checking' });
    const timer = setTimeout(() => {
      api
        .get<{ ok: boolean; code?: string }>(
          `/onboarding/nickname-check?value=${encodeURIComponent(trimmed)}`,
        )
        .then((result) =>
          setCheck(
            result.ok ? { status: 'ok' } : { status: 'bad', code: result.code },
          ),
        )
        // 검사에 실패해도 저장까지 막지 않는다. 서버가 저장할 때 다시 본다.
        .catch(() => setCheck({ status: 'unknown' }));
    }, 250);
    return () => clearTimeout(timer);
  }, [type, trimmed, unchanged]);

  const submit = async () => {
    if (!type) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(type === 'REAL' ? { type } : { type, nickname: trimmed });
    } catch (e) {
      setError(e instanceof RequestFailed ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    !blockedReason &&
    !unchanged &&
    (type === 'REAL' ||
      (type === 'NICKNAME' && trimmed.length >= 2 && check.status !== 'bad'));

  return (
    <div className="flex flex-col gap-4">
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
          {/* 버튼이 왜 그 상태인지 항상 한 줄로 말해 준다. 말없이 잠긴 버튼이 제일 나쁘다. */}
          {check.status === 'bad' && (
            <ErrorText>
              {NICKNAME_ERRORS[check.code ?? ''] ?? '사용할 수 없습니다.'}
            </ErrorText>
          )}
          {check.status === 'ok' && <Muted>사용할 수 있는 닉네임입니다.</Muted>}
          {check.status === 'checking' && <Muted>확인 중…</Muted>}
          {check.status === 'unknown' && (
            <Muted>지금은 확인하지 못했습니다. 저장을 누르면 서버가 다시 봅니다.</Muted>
          )}
          {check.status === 'idle' && !unchanged && trimmed.length < 2 && (
            <Muted>2자 이상 12자까지 쓸 수 있습니다.</Muted>
          )}
          {unchanged && <Muted>지금 쓰는 표시명과 같습니다. 바꾸면 저장할 수 있습니다.</Muted>}
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

      {/* 하루 1회에 걸린 것은 회색 한 줄로 흘리지 않는다. 이것 때문에 버튼이 잠긴다 */}
      {blockedReason ? <Notice>{blockedReason}</Notice> : note}

      {error && <ErrorText>{error}</ErrorText>}

      <div className="flex gap-2">
        <Button
          type="button"
          size="lg"
          disabled={!canSubmit || saving}
          onClick={() => void submit()}
        >
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="lg" variant="outline" onClick={onCancel}>
            취소
          </Button>
        )}
      </div>
    </div>
  );
}

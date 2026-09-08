import { useEffect, useState } from 'react';
import { api, RequestFailed } from '../../api/client';

const NICKNAME_ERRORS: Record<string, string> = {
  NICKNAME_TAKEN: '이미 사용 중인 닉네임입니다.',
  NICKNAME_LOOKS_LIKE_REAL_NAME:
    '다른 구성원의 실명과 비슷한 닉네임은 쓸 수 없습니다.',
  NICKNAME_INVALID: '사용할 수 없는 닉네임입니다. 2~12자로 지어주세요.',
};

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
    <div className="stack">
      <h2>다른 사람에게 어떻게 보일까요?</h2>

      <button
        type="button"
        className={`choice ${type === 'NICKNAME' ? 'selected' : ''}`}
        onClick={() => setType('NICKNAME')}
      >
        <strong>닉네임으로 활동</strong>
        <span className="muted">
          연결 전에는 닉네임만 보입니다. 수락하면 실명이 공개됩니다.
        </span>
      </button>

      {type === 'NICKNAME' && (
        <div className="stack">
          <input
            type="text"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="달리기왕"
            maxLength={12}
          />
          {check?.ok === false && (
            <p className="error">
              {NICKNAME_ERRORS[check.code ?? ''] ?? '사용할 수 없습니다.'}
            </p>
          )}
          {check?.ok === true && (
            <p className="muted">사용할 수 있는 닉네임입니다.</p>
          )}
        </div>
      )}

      <button
        type="button"
        className={`choice ${type === 'REAL' ? 'selected' : ''}`}
        onClick={() => setType('REAL')}
      >
        <strong>실명으로 활동 {realNamePreview && `(${realNamePreview})`}</strong>
        <span className="muted">
          처음부터 실명이 보입니다. 실명 표시가 붙습니다.
        </span>
      </button>

      <p className="muted">나중에 바꿀 수 있습니다.</p>

      {error && <p className="error">{error}</p>}

      <button
        className="primary"
        type="button"
        disabled={!canSubmit || saving}
        onClick={() => void submit()}
      >
        다음
      </button>
    </div>
  );
}

import { useState } from 'react';
import { api, RequestFailed } from '../../api/client';

/**
 * 실명 입력 (docs/06 §3.1.3).
 * 이름과 반을 따로 받아 "이름_캠퍼스_반"으로 조합해 미리 보여준다(D-47).
 * 검증하지 않는다. 사내 메신저에서 찾을 이름이므로 정확해야 한다는 것만 알린다.
 */
export function IdentityStep({ onDone }: { onDone: () => void }) {
  const [realName, setRealName] = useState('');
  const [classNo, setClassNo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const preview =
    realName && classNo ? `${realName}_서울_${classNo}` : '이름_서울_반';

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/onboarding/identity', { realName, classNo });
      onDone();
    } catch (e) {
      setError(e instanceof RequestFailed ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <h2>사내 메신저에 쓰는 이름을 알려주세요</h2>
      <p className="muted">
        사내 메신저에 표시되는 이름과 같아야 합니다. 연결이 성립될 때 상대에게
        공개됩니다.
      </p>

      <label>
        이름
        <input
          type="text"
          value={realName}
          onChange={(event) => setRealName(event.target.value)}
          placeholder="최준환"
        />
      </label>

      <label>
        반
        <input
          type="text"
          value={classNo}
          onChange={(event) => setClassNo(event.target.value)}
          placeholder="18반"
        />
      </label>

      <div className="card">
        <span className="muted">이렇게 보입니다</span>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{preview}</div>
      </div>

      {error && <p className="error">{error}</p>}

      <button
        className="primary"
        type="button"
        disabled={!realName.trim() || !classNo.trim() || saving}
        onClick={() => void submit()}
      >
        다음
      </button>
    </div>
  );
}

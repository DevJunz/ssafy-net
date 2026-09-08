import { useState } from 'react';
import { api, RequestFailed } from '../../api/client';

/**
 * 알림 설정 (docs/06 §3.1.5).
 *
 * 웹 서비스는 열어야만 보인다. 요청이 온 것을 모르면 수락도 재방문도 없다(R-12).
 * 브라우저 알림은 권하되 강요하지 않는다. 거부해도 진행된다.
 */
export function NotificationStep({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState(true);
  const [webPush, setWebPush] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const requestPush = async () => {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setWebPush(permission === 'granted');
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/onboarding/notifications', { email, webPush });
      onDone();
    } catch (e) {
      setError(e instanceof RequestFailed ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <h2>요청이 오면 어디로 알려드릴까요?</h2>

      <label className="row">
        <input
          type="checkbox"
          checked={email}
          onChange={(event) => setEmail(event.target.checked)}
        />
        <span>
          <strong>이메일</strong>
          <div className="muted">가입한 Google 계정으로 보냅니다.</div>
        </span>
      </label>

      <div className="row">
        <button type="button" onClick={() => void requestPush()}>
          {webPush ? '브라우저 알림 허용됨' : '브라우저 알림 허용하기'}
        </button>
        <span className="muted">
          브라우저가 열려 있으면 바로 알려드립니다.
        </span>
      </div>

      <p className="muted">설정에서 언제든 다시 켤 수 있습니다.</p>

      {error && <p className="error">{error}</p>}

      <button
        className="primary"
        type="button"
        disabled={saving}
        onClick={() => void submit()}
      >
        시작하기
      </button>
    </div>
  );
}

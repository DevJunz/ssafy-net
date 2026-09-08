import { useState } from 'react';
import { api, RequestFailed } from '../../api/client';

/**
 * Mattermost 계정 인증 (D-66).
 *
 * 온보딩의 첫 단계다. 여기서 막히면 뒤의 단계가 의미가 없다 —
 * 소속이 확인되지 않은 사람이 관심사를 고르게 하지 않는다.
 *
 * 이 한 단계가 두 가지를 한다.
 *   1. SSAFY 소속 검증 (계정이 있는 사람만 가입할 수 있다)
 *   2. 알림 채널 확보 (이후 모든 알림이 이 계정으로 간다)
 *
 * 실명을 같이 받는 이유는 DM 본문에 넣어 오타를 잡기 위해서다.
 */
export function MattermostStep({
  initialUsername,
  codeAlreadySent,
  onDone,
}: {
  initialUsername: string | null;
  codeAlreadySent: boolean;
  onDone: () => void;
}) {
  const [username, setUsername] = useState(initialUsername ?? '');
  const [realName, setRealName] = useState('');
  const [classNo, setClassNo] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(codeAlreadySent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview =
    realName && classNo ? `${realName}_서울_${classNo}` : '이름_서울_반';

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ operatorBypass: boolean }>(
        '/onboarding/mattermost/send',
        { username: username.trim(), realName, classNo },
      );
      // 운영자(웹훅 생성자)는 자기 자신에게 DM을 받을 수 없어 코드 없이 통과한다.
      if (result.operatorBypass) {
        onDone();
        return;
      }
      setSent(true);
    } catch (e) {
      setError(e instanceof RequestFailed ? e.message : '보내지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/onboarding/mattermost/verify', { code: code.trim() });
      onDone();
    } catch (e) {
      setError(e instanceof RequestFailed ? e.message : '확인하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="stack">
        <h2>Mattermost로 코드를 보냈습니다</h2>
        <p className="muted">
          <strong>@{username.replace(/^@/, '')}</strong> 님에게 6자리 코드를
          보냈습니다. Mattermost를 확인해주세요.
        </p>

        <input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          maxLength={6}
          style={{ fontSize: 22, letterSpacing: 6, textAlign: 'center' }}
        />

        {error && <p className="error">{error}</p>}

        <button
          className="primary"
          type="button"
          disabled={code.length !== 6 || busy}
          onClick={() => void verify()}
        >
          확인
        </button>

        <button type="button" onClick={() => { setSent(false); setCode(''); }}>
          아이디를 다시 입력할게요
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <h2>Mattermost 계정을 알려주세요</h2>
      <p className="muted">
        SSAFY 구성원인지 확인하고, 앞으로 알림을 이 계정으로 보내드립니다.
      </p>

      <label>
        Mattermost 아이디
        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="devjunsday"
          autoComplete="off"
        />
      </label>
      <p className="muted" style={{ marginTop: -8, fontSize: 12 }}>
        표시명(최준환[서울_18반])이 아니라 <strong>@아이디</strong>입니다.
        Mattermost에서 본인 프로필을 누르면 보입니다.
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
        <span className="muted">연결이 성립되면 이렇게 보입니다</span>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{preview}</div>
      </div>

      {error && <p className="error">{error}</p>}

      <button
        className="primary"
        type="button"
        disabled={
          username.trim().length < 3 ||
          !realName.trim() ||
          !classNo.trim() ||
          busy
        }
        onClick={() => void send()}
      >
        인증 코드 받기
      </button>
    </div>
  );
}

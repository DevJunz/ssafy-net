import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';

/**
 * 초대 / 소개 화면 (docs/06 §3.1.1).
 *
 * 세 문장으로 서비스를 설명하고, 실명이 언제 공개되는지를 이 시점에 알린다.
 * 공개 범위 안내는 온보딩 첫 화면·실명 입력·수락 확인 세 번 나온다(docs/12 §2).
 */
export function IntroPage() {
  const { code } = useParams<{ code?: string }>();
  const [inviteValid, setInviteValid] = useState<boolean | null>(
    code ? null : false,
  );

  useEffect(() => {
    if (!code) return;
    api
      .get<{ valid: boolean }>(`/invites/${code}`)
      .then((result) => setInviteValid(result.valid))
      .catch(() => setInviteValid(false));
  }, [code]);

  if (code && inviteValid === null) {
    return <main className="page">확인 중…</main>;
  }

  return (
    <main className="page">
      <h1>Interest Network</h1>

      <div className="stack">
        <p>관심사를 등록하면 나와 겹치는 사람이 그래프에 보입니다.</p>
        <p>서로 대화할 의사를 확인하면 실명이 공개됩니다.</p>
        <p>대화는 사내 메신저에서 이어서 합니다.</p>
      </div>

      <div className="card" style={{ marginTop: 32 }}>
        <strong>무엇이 언제 보이나요?</strong>
        <p className="muted" style={{ marginBottom: 0 }}>
          연결 전에는 표시명과 관심사만 보입니다. 연결이 성립되면 상대에게만
          실명이 추가로 보입니다.
        </p>
      </div>

      <div style={{ marginTop: 32 }}>
        {inviteValid ? (
          <a href="/api/auth/google">
            <button className="primary" type="button">
              Google로 시작하기
            </button>
          </a>
        ) : (
          <>
            <p className="error">초대 링크가 필요합니다.</p>
            <p className="muted">
              이미 가입하셨다면 아래로 로그인할 수 있습니다.
            </p>
            <a href="/api/auth/google">
              <button type="button">Google로 로그인</button>
            </a>
          </>
        )}
      </div>
    </main>
  );
}

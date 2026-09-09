import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { SERVICE_NAME } from '@ssafy-net/shared';
import { api } from '../api/client';
import { BrandMark } from '../components/BrandMark';

/**
 * 초대 / 소개 화면 (docs/06 §3.1.1).
 *
 * 세 문장으로 서비스를 설명하고, 실명이 언제 공개되는지를 이 시점에 알린다.
 * 공개 범위 안내는 온보딩 첫 화면·실명 입력·수락 확인 세 번 나온다(docs/12 §2).
 *
 * 알림 딥링크가 로그인을 거쳐 여기로 오면(`/login?redirect=…`) 그 목적지를
 * Google 로그인에 실어 보낸다. 서버가 서명된 state로 받아 로그인 뒤 그리로 돌려보낸다(J6).
 */
export function IntroPage() {
  const { code } = useParams<{ code?: string }>();
  const [params] = useSearchParams();
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

  const redirect = params.get('redirect');
  const loginHref =
    redirect && redirect.startsWith('/') && !redirect.startsWith('//')
      ? `/api/auth/google?redirect=${encodeURIComponent(redirect)}`
      : '/api/auth/google';
  // 로그인 실패는 다시 시도 외에 다른 경로가 없다(docs/06 §3.1.2).
  const loginFailed = params.get('error') === 'failed';

  if (code && inviteValid === null) {
    return (
      <main className="intro">
        <div className="intro-inner">
          <p className="muted">초대 링크를 확인하는 중…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="intro">
      <IntroDecor />

      <div className="intro-inner">
        <h1 className="intro-title">
          <BrandMark size={36} />
          {SERVICE_NAME}
        </h1>

        <ol className="intro-steps">
          <li>관심사를 등록하면 나와 겹치는 사람이 그래프에 보입니다.</li>
          <li>서로 대화할 의사를 확인하면 실명이 공개됩니다.</li>
          <li>대화는 사내 메신저에서 이어서 합니다.</li>
        </ol>

        <div className="intro-privacy">
          <strong>무엇이 언제 보이나요?</strong>
          <p>
            연결 전에는 표시명과 관심사만 보입니다. 연결이 성립되면 상대에게만
            실명이 추가로 보입니다.
          </p>
        </div>

        <div className="intro-cta">
          {loginFailed && (
            <p className="error">로그인에 실패했습니다. 다시 시도해주세요.</p>
          )}

          {inviteValid ? (
            <a className="button primary" href={loginHref}>
              Google로 시작하기
            </a>
          ) : (
            <>
              {/* 로그인 실패 문장이 이미 빨간색이면 이 줄은 안내로만 둔다 */}
              <p className={loginFailed ? 'muted' : 'error'}>
                초대 링크가 필요합니다.
              </p>
              <p className="muted">
                이미 가입하셨다면 아래로 로그인할 수 있습니다.
              </p>
              <a className="button" href={loginHref}>
                Google로 로그인
              </a>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

/** 뒤에 옅게 깔리는 장식 그래프. 의미는 없고 서비스의 기본 표현을 되풀이할 뿐이다. */
function IntroDecor() {
  const nodes: [number, number, number][] = [
    [210, 200, 18],
    [120, 110, 9],
    [300, 90, 11],
    [340, 230, 8],
    [270, 320, 12],
    [140, 300, 7],
    [70, 210, 10],
    [380, 140, 6],
    [210, 60, 7],
  ];
  const edges: [number, number][] = [
    [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6],
    [2, 7], [2, 8], [1, 8], [4, 3], [5, 6],
  ];

  return (
    <svg className="intro-decor" viewBox="0 0 420 420" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2" opacity="0.7">
        {edges.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={nodes[a][0]}
            y1={nodes[a][1]}
            x2={nodes[b][0]}
            y2={nodes[b][1]}
          />
        ))}
      </g>
      <g fill="currentColor">
        {nodes.map(([x, y, r], index) => (
          <circle key={index} cx={x} cy={y} r={r} />
        ))}
      </g>
    </svg>
  );
}

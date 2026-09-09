import { SERVICE_NAME } from '@ssafy-net/shared';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { api } from '../api/client';
import { BrandMark } from '../components/BrandMark';
import { ErrorText, Muted } from '../components/primitives';

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

  const shellClass =
    'relative min-h-dvh overflow-hidden bg-background bg-[radial-gradient(60%_50%_at_80%_0%,rgb(28_126_214/0.1),transparent_70%),radial-gradient(50%_40%_at_0%_100%,rgb(28_126_214/0.06),transparent_70%)]';
  const innerClass =
    'relative mx-auto max-w-[560px] px-6 pt-[72px] pb-24 max-sm:px-5 max-sm:pt-12 max-sm:pb-[72px]';

  if (code && inviteValid === null) {
    return (
      <main className={shellClass}>
        <div className={innerClass}>
          <Muted>초대 링크를 확인하는 중…</Muted>
        </div>
      </main>
    );
  }

  return (
    <main className={shellClass}>
      <IntroDecor />

      <div className={innerClass}>
        <h1 className="mt-[22px] flex flex-wrap items-center gap-3.5 text-[40px] leading-[1.12] font-extrabold tracking-[-0.035em] max-sm:text-[32px]">
          <span className="flex-none">
            <BrandMark size={36} />
          </span>
          {SERVICE_NAME}
        </h1>

        <ol className="mt-[34px] flex list-none flex-col gap-3.5 p-0 [counter-reset:step]">
          {[
            '관심사를 등록하면 나와 겹치는 사람이 그래프에 보입니다.',
            '서로 대화할 의사를 확인하면 실명이 공개됩니다.',
            '대화는 사내 메신저에서 이어서 합니다.',
          ].map((text) => (
            <li
              key={text}
              className="relative pl-10 text-[17px] leading-normal [counter-increment:step] before:absolute before:top-px before:left-0 before:grid before:size-[26px] before:place-items-center before:rounded-full before:bg-accent before:text-xs before:font-bold before:text-accent-foreground before:content-[counter(step)] max-sm:text-[15.5px]"
            >
              {text}
            </li>
          ))}
        </ol>

        <div className="mt-9 rounded-xl border bg-white/70 px-[18px] py-4 backdrop-blur-sm">
          <strong className="mb-1 block text-[14.5px] font-semibold">
            무엇이 언제 보이나요?
          </strong>
          <p className="m-0 text-sm text-foreground/70">
            연결 전에는 표시명과 관심사만 보입니다. 연결이 성립되면 상대에게만
            실명이 추가로 보입니다.
          </p>
        </div>

        <div className="mt-9 flex flex-col items-start gap-3">
          {loginFailed && (
            <ErrorText className="m-0 font-semibold">
              로그인에 실패했습니다. 다시 시도해주세요.
            </ErrorText>
          )}

          {inviteValid ? (
            <Button asChild size="lg" className="h-auto px-[22px] py-3 text-[15.5px] font-semibold max-sm:w-full">
              <a href={loginHref}>Google로 시작하기</a>
            </Button>
          ) : (
            <>
              {/* 로그인 실패 문장이 이미 빨간색이면 이 줄은 안내로만 둔다 */}
              {loginFailed ? (
                <Muted className="m-0">초대 링크가 필요합니다.</Muted>
              ) : (
                <ErrorText className="m-0">초대 링크가 필요합니다.</ErrorText>
              )}
              <Muted className="m-0">이미 가입하셨다면 아래로 로그인할 수 있습니다.</Muted>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-auto px-[22px] py-3 text-[15.5px] font-semibold max-sm:w-full"
              >
                <a href={loginHref}>Google로 로그인</a>
              </Button>
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
    <svg
      className="pointer-events-none absolute top-10 -right-[60px] h-[420px] w-[420px] text-primary opacity-[0.11] max-sm:top-5 max-sm:-right-[90px] max-sm:h-[300px] max-sm:w-[300px]"
      viewBox="0 0 420 420"
      aria-hidden="true"
    >
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

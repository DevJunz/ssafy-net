import type { OnboardingState } from '@ssafy-net/shared';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';
import { api } from '../api/client';
import { Muted, Page } from '../components/primitives';
import { InterestPicker } from '../features/interests/InterestPicker';
import { useSession } from '../session';
import { DisplayNameStep } from './onboarding/DisplayNameStep';
import { MattermostStep } from './onboarding/MattermostStep';

const ORDER: OnboardingState['step'][] = [
  'MATTERMOST',
  'DISPLAY_NAME',
  'INTERESTS',
];

/**
 * 온보딩 (docs/04 J0).
 *
 * 어디까지 했는지는 클라이언트가 기억하지 않는다. 서버가 사용자 상태에서
 * 계산해 알려준다. 중단하고 나갔다 와도 그 지점부터 이어서 하기 위해서다.
 */
export function OnboardingPage() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const navigate = useNavigate();
  const { reload } = useSession();

  const refresh = useCallback(async () => {
    const next = await api.get<OnboardingState>('/onboarding/state');
    setState(next);
    if (next.step === 'DONE') {
      await reload();
      navigate('/', { replace: true });
    }
  }, [navigate, reload]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!state) return <Page>불러오는 중…</Page>;

  const currentIndex = ORDER.indexOf(state.step);

  return (
    <Page>
        {/* 단계 진행. 세 단계 중 어디까지 왔는지만 보여준다 */}
        <Progress
          value={((currentIndex + 1) / ORDER.length) * 100}
          className="mb-7 h-[3px] bg-border"
          aria-label={`${ORDER.length}단계 중 ${currentIndex + 1}단계`}
        />

        {state.step === 'MATTERMOST' && (
          <MattermostStep
            initialUsername={state.mattermostUsername}
            codeAlreadySent={state.codeSent}
            onDone={() => void refresh()}
          />
        )}

        {state.step === 'DISPLAY_NAME' && (
          <DisplayNameStep
            realNamePreview={state.realNamePreview}
            onDone={() => void refresh()}
          />
        )}

        {state.step === 'INTERESTS' && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl">관심 있는 것을 골라주세요</h2>
            <Muted>
              고른 관심사는 다른 구성원에게 보입니다. 나중에 언제든 바꿀 수
              있습니다. 저장하면 바로 시작됩니다.
            </Muted>
            <InterestPicker
              submitLabel="시작하기"
              onSaved={async () => {
                // 관심사를 저장하면 온보딩이 끝난다. 알림은 Mattermost로 가고,
                // 그 계정은 첫 단계에서 이미 확인했다(D-67).
                await api.post('/onboarding/complete');
                await refresh();
              }}
            />
          </div>
        )}
    </Page>
  );
}

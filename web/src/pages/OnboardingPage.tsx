import type { OnboardingState } from '@ssafy-net/shared';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { InterestPicker } from '../features/interests/InterestPicker';
import { useSession } from '../session';
import { DisplayNameStep } from './onboarding/DisplayNameStep';
import { IdentityStep } from './onboarding/IdentityStep';
import { NotificationStep } from './onboarding/NotificationStep';

const ORDER: OnboardingState['step'][] = [
  'IDENTITY',
  'DISPLAY_NAME',
  'INTERESTS',
  'NOTIFICATIONS',
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

  if (!state) return <main className="page">불러오는 중…</main>;

  const currentIndex = ORDER.indexOf(state.step);

  return (
    <main className="page">
      <div className="steps">
        {ORDER.map((step, index) => (
          <span key={step} className={index <= currentIndex ? 'done' : ''} />
        ))}
      </div>

      {state.step === 'IDENTITY' && (
        <IdentityStep onDone={() => void refresh()} />
      )}

      {state.step === 'DISPLAY_NAME' && (
        <DisplayNameStep
          realNamePreview={state.realNamePreview}
          onDone={() => void refresh()}
        />
      )}

      {state.step === 'INTERESTS' && (
        <div className="stack">
          <h2>관심 있는 것을 골라주세요</h2>
          <p className="muted">
            고른 관심사는 다른 구성원에게 보입니다. 나중에 언제든 바꿀 수
            있습니다.
          </p>
          <InterestPicker submitLabel="다음" onSaved={() => void refresh()} />
        </div>
      )}

      {state.step === 'NOTIFICATIONS' && (
        <NotificationStep onDone={() => void refresh()} />
      )}
    </main>
  );
}

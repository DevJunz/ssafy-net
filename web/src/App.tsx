import type { FollowUpItem, ReceivedRequestSummary } from '@ssafy-net/shared';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api/client';
import { Shell } from './components/Shell';
import { FollowUpOverlay } from './features/connections/Overlays';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { GraphPage } from './pages/GraphPage';
import { IntroPage } from './pages/IntroPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ProfilePage } from './pages/ProfilePage';
import { SessionProvider, useSession } from './session';

function AuthenticatedApp() {
  const [received, setReceived] = useState<ReceivedRequestSummary[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);

  /**
   * 배지는 **처리가 필요한 것의 수**다(D-31). 미읽음 수가 아니다.
   * 0이면 할 일이 없다는 뜻이어야 한다.
   */
  const refreshBadge = useCallback(async () => {
    const [requests, pending] = await Promise.all([
      api
        .get<ReceivedRequestSummary[]>('/connection-requests?box=received')
        .catch(() => []),
      api.get<FollowUpItem[]>('/follow-ups/pending').catch(() => []),
    ]);
    setReceived(requests);
    setFollowUps(pending);
  }, []);

  useEffect(() => {
    void refreshBadge();
  }, [refreshBadge]);

  return (
    <Shell badge={received.length + followUps.length}>
      <Routes>
        <Route path="/" element={<GraphPage />} />
        <Route
          path="/connections"
          element={<ConnectionsPage onChanged={refreshBadge} />}
        />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* 후속 확인은 어느 화면 위에서든 열린다(docs/05 §3.13 Overlay) */}
      {followUps.length > 0 && (
        <FollowUpOverlay
          item={followUps[0]}
          onClose={() => setFollowUps((items) => items.slice(1))}
          onAnswered={() => {
            setFollowUps((items) => items.slice(1));
            void refreshBadge();
          }}
        />
      )}
    </Shell>
  );
}

function Routing() {
  const { me, loading } = useSession();

  if (loading) return <main className="page">불러오는 중…</main>;

  if (!me) {
    return (
      <Routes>
        <Route path="/invite/:code" element={<IntroPage />} />
        <Route path="*" element={<IntroPage />} />
      </Routes>
    );
  }

  // 온보딩을 마치기 전에는 그래프에 갈 수 없다(FR-1.6).
  if (me.status !== 'ACTIVE') {
    return (
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    );
  }

  return <AuthenticatedApp />;
}

export function App() {
  return (
    <SessionProvider>
      <Routing />
    </SessionProvider>
  );
}

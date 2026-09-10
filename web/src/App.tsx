import type {
  FeatureFlagMap,
  FollowUpItem,
  ParameterMap,
} from '@ssafy-net/shared';
import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { api } from './api/client';
import { Page } from './components/primitives';
import { Shell } from './components/Shell';
import { FollowUpOverlay } from './features/connections/Overlays';
import { DEMO_MODE } from './mocks';
import { DemoBanner } from './mocks/DemoBanner';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { GraphPage } from './pages/GraphPage';
import { IntroPage } from './pages/IntroPage';
import { NetworksPage } from './pages/NetworksPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ProfilePage } from './pages/ProfilePage';
import { SessionProvider, useSession } from './session';

// 운영자만 여는 화면이라 따로 나눠 받는다. 일반 사용자 번들에 들어가지 않는다(D-77).
const OpsPage = lazy(() => import('./pages/OpsPage'));

function AuthenticatedApp() {
  const { me } = useSession();
  const [badge, setBadge] = useState(0);
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [features, setFeatures] = useState<FeatureFlagMap | null>(null);

  /**
   * 배지는 **처리가 필요한 것의 수**다(D-31). 미읽음 수가 아니다.
   * 0이면 할 일이 없다는 뜻이어야 한다.
   */
  const refreshBadge = useCallback(async () => {
    const [count, pending] = await Promise.all([
      api
        .get<{ count: number }>('/notifications/badge')
        .then((result) => result.count)
        .catch(() => 0),
      api.get<FollowUpItem[]>('/follow-ups/pending').catch(() => []),
    ]);
    setBadge(count);
    setFollowUps(pending);
  }, []);

  useEffect(() => {
    void refreshBadge();
  }, [refreshBadge]);

  useEffect(() => {
    api
      .get<{ parameters: ParameterMap; features: FeatureFlagMap }>('/parameters')
      .then((result) => setFeatures(result.features))
      .catch(() => {});
  }, []);

  return (
    <Shell badge={badge} networkEnabled={features?.network_enabled}>
      <Routes>
        <Route path="/" element={<GraphPage />} />
        <Route
          path="/connections"
          element={<ConnectionsPage onChanged={refreshBadge} />}
        />
        {features?.network_enabled && (
          <Route
            path="/networks"
            element={<NetworksPage onChanged={refreshBadge} />}
          />
        )}
        <Route
          path="/notifications"
          element={<NotificationsPage onChanged={refreshBadge} />}
        />
        <Route path="/profile" element={<ProfilePage />} />
        {/* 운영자 대시보드. 서버도 is_operator 가 아니면 403 을 준다 */}
        {me?.isOperator && !DEMO_MODE && (
          <Route
            path="/ops"
            element={
              <Suspense fallback={<Page>불러오는 중…</Page>}>
                <OpsPage />
              </Suspense>
            }
          />
        )}
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

  if (loading) return <Page>불러오는 중…</Page>;

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
      <TooltipProvider delayDuration={300}>
        {DEMO_MODE && <DemoBanner />}
        <Routing />
        {/* 토스트는 화면 아래 가운데 하나. 닫기 버튼을 둔다 — 되돌리기 같은 행동이 붙는다 */}
        <Toaster position="bottom-center" closeButton />
      </TooltipProvider>
    </SessionProvider>
  );
}

import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { IntroPage } from './pages/IntroPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { SessionProvider, useSession } from './session';

function Routing() {
  const { me, loading } = useSession();

  if (loading) return <main className="page">불러오는 중…</main>;

  return (
    <Routes>
      <Route path="/invite/:code" element={<IntroPage />} />
      <Route path="/invite-required" element={<IntroPage />} />
      <Route path="/login" element={<IntroPage />} />

      {!me && <Route path="*" element={<IntroPage />} />}

      {me && (
        <>
          {/* 온보딩을 마치기 전에는 그래프에 갈 수 없다(FR-1.6). */}
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route
            path="/"
            element={
              me.status === 'ACTIVE' ? (
                <HomePage />
              ) : (
                <Navigate to="/onboarding" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
}

export function App() {
  return (
    <SessionProvider>
      <Routing />
    </SessionProvider>
  );
}

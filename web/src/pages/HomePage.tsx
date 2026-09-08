import { useSession } from '../session';

/**
 * 그래프가 홈이다(D-22). M2에서 그래프와 사이드 패널이 여기 들어온다.
 * 지금은 온보딩이 끝났다는 것만 확인할 수 있는 자리다.
 */
export function HomePage() {
  const { me } = useSession();
  if (!me) return null;

  return (
    <main className="page">
      <h1>{me.displayName}님, 준비됐습니다</h1>
      <p className="muted">
        실명 {me.realName} · 관심사 {me.interests.length}개
      </p>

      <div className="chips" style={{ marginTop: 16 }}>
        {me.interests.map((interest) => (
          <span key={interest.id} className="chip selected">
            {interest.name}
          </span>
        ))}
      </div>

      <div className="card" style={{ marginTop: 32 }}>
        <strong>다음 단계 (M2)</strong>
        <p className="muted" style={{ marginBottom: 0 }}>
          나를 중심으로 한 그래프와 사이드 패널, Similar People이 이 화면에
          들어옵니다.
        </p>
      </div>
    </main>
  );
}

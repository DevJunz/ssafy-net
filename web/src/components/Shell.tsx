import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useSession } from '../session';
import './shell.css';

/**
 * 전역 내비게이션 (docs/05 §2).
 * 그래프 · 연결 · 네트워크(S2) · 알림 · 내 프로필. 이 이상 늘리지 않는다.
 * 네트워크는 데이터 게이트를 통과해야 나타난다(docs/10 §4).
 */
export function Shell({
  children,
  badge,
}: {
  children: ReactNode;
  badge?: number;
}) {
  const { me } = useSession();

  return (
    <div className="shell">
      <header className="nav">
        <span className="brand">Interest Network</span>

        <nav>
          <NavLink to="/" end>
            그래프
          </NavLink>
          <NavLink to="/connections">
            연결
            {/* 배지는 처리가 필요한 것의 수다. 0이면 할 일이 없다는 뜻이어야 한다(D-31) */}
            {badge ? <em className="badge-dot">{badge}</em> : null}
          </NavLink>
          <NavLink to="/profile">내 프로필</NavLink>
        </nav>

        <span className="who">{me?.displayName}</span>
      </header>

      <div className="shell-body">{children}</div>
    </div>
  );
}

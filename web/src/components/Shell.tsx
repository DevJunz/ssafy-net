import { SERVICE_NAME } from '@ssafy-net/shared';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DEMO_MODE } from '../mocks';
import { useSession } from '../session';
import { BrandMark } from './BrandMark';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-foreground/70 no-underline transition-colors hover:bg-secondary hover:text-foreground active:translate-y-px max-sm:px-2.5',
    isActive &&
      'bg-accent font-semibold text-accent-foreground hover:bg-accent hover:text-accent-foreground',
  );

/**
 * 전역 내비게이션 (docs/05 §2).
 * 그래프 · 연결 · 네트워크(S2) · 알림 · 내 프로필. 이 이상 늘리지 않는다.
 * 네트워크는 데이터 게이트를 통과해야 나타난다(docs/10 §4).
 */
export function Shell({
  children,
  badge,
  networkEnabled,
}: {
  children: ReactNode;
  badge?: number;
  networkEnabled?: boolean;
}) {
  const { me } = useSession();

  return (
    // 모바일 브라우저의 주소창이 접히고 펴져도 높이가 튀지 않게 dvh를 쓴다.
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* 키보드로 쓰는 사람만 보게 한다. 첫 Tab에 나타난다. */}
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-[13px] focus:text-background focus:no-underline"
        href="#main"
      >
        본문으로 건너뛰기
      </a>

      <header className="flex h-[54px] flex-none items-center gap-5 border-b bg-background/90 px-5 backdrop-blur-md max-sm:gap-3 max-sm:px-3">
        <span className="inline-flex items-center gap-2 text-[14.5px] font-extrabold tracking-tight whitespace-nowrap">
          <BrandMark />
          {/* 좁으면 마크만 남긴다 */}
          <span className="max-sm:hidden">{SERVICE_NAME}</span>
        </span>

        <nav
          aria-label="주 메뉴"
          className="flex min-w-0 gap-0.5 max-sm:flex-1 max-sm:overflow-x-auto max-sm:[scrollbar-width:none]"
        >
          <NavLink to="/" end className={navLinkClass}>
            그래프
          </NavLink>
          <NavLink to="/connections" className={navLinkClass}>
            연결
          </NavLink>
          {/* 게이트를 통과하기 전에는 메뉴 자체가 없다(docs/10 §4) */}
          {networkEnabled && (
            <NavLink to="/networks" className={navLinkClass}>
              네트워크
            </NavLink>
          )}
          <NavLink to="/notifications" className={navLinkClass}>
            알림
            {/* 배지는 처리가 필요한 것의 수다. 0이면 할 일이 없다는 뜻이어야 한다(D-31) */}
            {badge ? (
              <Badge
                variant="destructive"
                className="h-[17px] min-w-[17px] rounded-full px-1.5 text-[11px] font-bold"
              >
                {badge}
              </Badge>
            ) : null}
          </NavLink>
          <NavLink to="/profile" className={navLinkClass}>
            내 프로필
          </NavLink>
        </nav>

        <span className="ml-auto flex min-w-0 items-center gap-2">
          {/* 운영자 대시보드 입구. 주 메뉴는 다섯 개로 고정이라(docs/05 §2) 오른쪽에 따로 둔다 */}
          {me?.isOperator && !DEMO_MODE && (
            <NavLink to="/ops" className={navLinkClass}>
              운영
            </NavLink>
          )}
          <span className="max-w-[180px] truncate text-[13px] text-muted-foreground max-sm:hidden">
            {me?.displayName}
          </span>
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden" id="main">
        {children}
      </div>
    </div>
  );
}

import type { ComponentProps, ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';

/**
 * 화면 곳곳에서 같은 모양으로 쓰는 작은 조각들.
 * shadcn/ui 컴포넌트 위에 이 서비스의 표현(칩·상태 배지·목록 한 줄)을 얹은 것이다.
 * 색은 index.css 의 토큰만 쓴다.
 */

/** 스크롤되는 목록 화면의 바깥 틀. 셸 본문이 overflow hidden 이라 여기서 스크롤한다. */
export function ScrollPage({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('h-full overflow-y-auto bg-secondary', className)} {...props} />
  );
}

/** 본문 칸. 760px 에 맞추고 좁으면 여백을 줄인다. */
export function Page({
  className,
  narrow,
  ...props
}: ComponentProps<'main'> & { narrow?: boolean }) {
  return (
    <main
      className={cn(
        'mx-auto w-full max-w-[760px] px-6 pt-11 pb-24 max-sm:px-4 max-sm:pt-7 max-sm:pb-20',
        narrow && 'max-w-[640px]',
        className,
      )}
      {...props}
    />
  );
}

/** 화면 제목. 페이지마다 인라인으로 크기를 주지 않는다. */
export function PageTitle({ className, ...props }: ComponentProps<'h1'>) {
  return <h1 className={cn('mb-1 text-[22px]', className)} {...props} />;
}

export function PageLede({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('mb-5 text-foreground/70', className)} {...props} />;
}

export function SectionTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('mb-1 text-[17px] font-semibold', className)} {...props} />;
}

/** 목록 위에 붙는 작은 머리말 */
export function SectionLabel({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mb-2 text-[11.5px] font-bold tracking-wider text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function Muted({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function ErrorText({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-destructive', className)} {...props} />;
}

/** 안내 상자. 빈 상태와 규칙 설명에 쓴다. 테두리 대신 바탕색으로 구분한다. */
export function Notice({
  className,
  children,
  ...props
}: ComponentProps<typeof Alert>) {
  return (
    <Alert
      className={cn(
        'border-transparent bg-muted px-3.5 py-3 text-foreground/75',
        className,
      )}
      {...props}
    >
      <AlertDescription className="block text-[13px] leading-relaxed text-inherit">
        {children}
      </AlertDescription>
    </Alert>
  );
}

/**
 * 상태 배지. 칩(관심사)과 구분되게 모서리를 살짝만 깎는다.
 *   state — 연결 상태, "내 관심사" 같은 파란 표시
 *   real  — 실명 사용자 표시(FR-0.5). 닉네임과 헷갈리지 않게 채워서 구분한다
 */
export function Tag({
  tone = 'plain',
  className,
  ...props
}: ComponentProps<typeof Badge> & { tone?: 'plain' | 'state' | 'real' }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded px-1.5 py-0 align-middle text-[11px] leading-[1.35] font-semibold text-muted-foreground',
        tone === 'state' && 'border-primary/30 bg-accent text-accent-foreground',
        tone === 'real' && 'border-transparent bg-muted text-foreground/70',
        className,
      )}
      {...props}
    />
  );
}

/** 관심사 칩(누르는 것). Toggle 이라 선택 상태가 aria-pressed 로 드러난다. */
export function Chip({
  selected = false,
  count,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Toggle>, 'pressed'> & {
  selected?: boolean;
  /** 사람 수처럼 이름 뒤에 작게 붙는 것 */
  count?: ReactNode;
}) {
  return (
    <Toggle
      pressed={selected}
      size="sm"
      className={cn(
        'h-auto gap-1.5 rounded-full border border-border bg-card px-3 py-[5px] text-[13.5px] font-normal text-foreground hover:border-input hover:bg-secondary hover:text-foreground',
        'data-[state=on]:border-primary/30 data-[state=on]:bg-accent data-[state=on]:font-medium data-[state=on]:text-accent-foreground data-[state=on]:hover:bg-accent/70',
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && (
        <span
          className={cn(
            'text-xs font-normal text-muted-foreground',
            selected && 'text-accent-foreground/70',
          )}
        >
          {count}
        </span>
      )}
    </Toggle>
  );
}

/** 관심사 칩(보기만 하는 것) */
export function ChipTag({
  selected = false,
  className,
  ...props
}: ComponentProps<typeof Badge> & { selected?: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-full border-border bg-card px-3 py-[5px] text-[13px] font-normal text-foreground',
        selected && 'border-primary/30 bg-accent font-medium text-accent-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function Chips({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-wrap gap-2', className)} {...props} />;
}

/** 목록 화면의 한 줄(Connections · Networks · Notifications). 누를 수 있으면 button 이다. */
const cardRowClass =
  'mb-2 flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3.5 text-left shadow-xs max-sm:px-3.5 max-sm:py-3';

export function CardRow({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn(cardRowClass, className)} {...props} />;
}

export function CardRowButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        cardRowClass,
        'cursor-pointer outline-none transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    />
  );
}

export function CardRowBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('min-w-0 flex-1', className)} {...props} />;
}

export function CardRowTitle({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-[7px] font-semibold', className)}
      {...props}
    />
  );
}

export function CardRowSub({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('mt-0.5 truncate text-[13px] text-muted-foreground', className)}
      {...props}
    />
  );
}

export function CardRowRight({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex-none text-right text-xs leading-normal whitespace-nowrap text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

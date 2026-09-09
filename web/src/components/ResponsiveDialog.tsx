import type { ComponentProps, ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useMediaQuery } from './useMediaQuery';

/** 이 폭 아래에서 오버레이는 아래에서 올라오는 시트가 된다. 엄지가 닿는 곳에 버튼이 온다. */
export const SHEET_BREAKPOINT_QUERY = '(min-width: 640px)';

/**
 * Overlay (docs/05 §3.13). 넓으면 가운데 대화상자, 640px 아래에서는 하단 시트.
 * 항상 열린 상태로 그리고, 닫힘(Escape · 바깥 클릭 · ×)은 Radix 가 onClose 로 알려준다.
 */
export function ResponsiveDialog({
  title,
  description,
  children,
  onClose,
  className,
}: {
  title: ReactNode;
  /** 제목 아래 흐린 한 줄. 없으면 접근성 설명도 붙이지 않는다 */
  description?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const wide = useMediaQuery(SHEET_BREAKPOINT_QUERY);
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  // 설명이 없으면 Radix 가 콘솔에 경고를 남긴다. 그 속성을 비워 보내면 조용하다.
  const describedBy = description ? {} : { 'aria-describedby': undefined };

  if (wide) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent
          {...describedBy}
          className={cn(
            'block max-h-[86dvh] overflow-y-auto px-[26px] pt-[26px] pb-[22px] sm:max-w-[520px]',
            className,
          )}
        >
          <DialogHeader className="gap-1.5 text-left">
            <DialogTitle className="text-[19px] leading-snug">{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        {...describedBy}
        className={cn(
          'block max-h-[92dvh] overflow-y-auto rounded-t-2xl px-[18px] pt-[22px] pb-[calc(18px+env(safe-area-inset-bottom))]',
          className,
        )}
      >
        <SheetHeader className="gap-1.5 p-0 text-left">
          <SheetTitle className="text-[19px] leading-snug">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}

/** 오버레이 안의 한 단락. 위 단락과 띄운다. */
export function OverlaySection({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-[18px]', className)} {...props} />;
}

/** 오버레이 맨 아래 버튼 줄. 좁으면 줄바꿈하고 버튼을 키운다. */
export function OverlayActions({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mt-[22px] flex gap-2 max-sm:flex-wrap max-sm:[&>button]:min-h-11',
        className,
      )}
      {...props}
    />
  );
}

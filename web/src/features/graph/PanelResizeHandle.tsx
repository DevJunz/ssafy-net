import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';

/**
 * 패널과 그래프 사이의 세로 손잡이. 끌면 패널 폭이 바뀐다.
 *
 * 경계선 위에 8px 폭으로 겹쳐 있고 평소에는 보이지 않는다. 올리거나 끄는 동안만
 * 가는 선이 나타난다. 키보드로는 화살표(16px, Shift 는 48px). 두 번 누르면 기본 폭.
 * 그래프 화면의 grid 컨테이너(relative) 안에서 절대 위치로 놓인다.
 */
export function PanelResizeHandle({
  side,
  width,
  min,
  max,
  label,
  onResize,
  onReset,
}: {
  side: 'left' | 'right';
  /** 지금 패널 폭(px). 손잡이 위치와 접근성 값에 쓴다 */
  width: number;
  min: number;
  max: number;
  label: string;
  /** 패널의 새 폭(px). 범위 밖이면 받는 쪽이 잘라낸다 */
  onResize: (px: number) => void;
  onReset: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; width: number } | null>(null);

  // 끄는 동안은 화면 어디에 있어도 같은 커서를 보이고 글자가 선택되지 않게 한다
  useEffect(() => {
    if (!dragging) return;
    document.body.classList.add('cursor-col-resize', 'select-none');
    return () => document.body.classList.remove('cursor-col-resize', 'select-none');
  }, [dragging]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, width };
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const delta = event.clientX - start.current.x;
    // 왼쪽 패널은 오른쪽으로 끌면 넓어지고, 오른쪽 패널은 왼쪽으로 끌면 넓어진다
    onResize(start.current.width + (side === 'left' ? delta : -delta));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.shiftKey ? 48 : 16;
    const toward = event.key === 'ArrowRight' ? 1 : -1;
    onResize(width + (side === 'left' ? toward : -toward) * step);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="끌어서 폭 조정 · 두 번 누르면 기본 폭"
      className="group absolute inset-y-0 z-[3] w-2 cursor-col-resize touch-none outline-none select-none"
      // 경계선(패널 폭 지점)에 손잡이 가운데를 맞춘다
      style={side === 'left' ? { left: width - 4 } : { right: width - 4 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    >
      <div
        className={cn(
          'absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full transition-colors group-hover:bg-primary/40 group-focus-visible:bg-primary/60',
          dragging && 'bg-primary/60 group-hover:bg-primary/60',
        )}
      />
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';

export interface PanelWidths {
  /** 관심사 레일(왼쪽) 폭, px */
  left: number;
  /** 상세 패널(오른쪽) 폭, px */
  right: number;
}

/** 끌어서 바꿀 수 있는 범위. 가운데 그래프는 CENTER_MIN 보다 좁아지지 않는다. */
export const PANEL_LIMITS = {
  left: { min: 160, max: 420 },
  right: { min: 260, max: 600 },
} as const;
const CENTER_MIN = 360;

/** index.css 의 `--breakpoint-wide`(70rem)와 같다. 넓은 화면이면 기본 폭이 조금 더 넓다. */
export const WIDE_QUERY = '(min-width: 70rem)';

const STORAGE_KEY = 'sn.graph.panelWidths';

/** 조정한 적이 없을 때의 폭. 옛 grid-cols 값 그대로다. */
export const defaultPanelWidths = (wide: boolean): PanelWidths =>
  wide ? { left: 232, right: 372 } : { left: 208, right: 332 };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function load(): PanelWidths | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PanelWidths>;
    if (typeof parsed.left !== 'number' || typeof parsed.right !== 'number') {
      return null;
    }
    return { left: parsed.left, right: parsed.right };
  } catch {
    return null;
  }
}

function save(widths: PanelWidths | null) {
  try {
    if (widths) localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 저장이 막힌 브라우저면 이번 화면에서만 유지된다
  }
}

/** 창이 좁아 셋이 다 들어가지 않으면 패널부터 줄인다. 저장값은 건드리지 않는다. */
function fit(widths: PanelWidths, viewport: number): PanelWidths {
  let left = clamp(widths.left, PANEL_LIMITS.left.min, PANEL_LIMITS.left.max);
  let right = clamp(widths.right, PANEL_LIMITS.right.min, PANEL_LIMITS.right.max);
  const spare = viewport - CENTER_MIN;
  if (viewport > 0 && left + right > spare) {
    const ratio = Math.max(0, spare) / (left + right);
    left = Math.max(PANEL_LIMITS.left.min, Math.floor(left * ratio));
    right = Math.max(PANEL_LIMITS.right.min, Math.floor(right * ratio));
  }
  return { left, right };
}

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

/**
 * 그래프 화면 양쪽 패널의 폭.
 *
 * 사용자가 손잡이를 끌어 바꾸면 브라우저(localStorage)에 남아 다음에도 같다.
 * 한 번도 바꾸지 않았으면 화면 폭에 따른 기본값이다. `reset()` 이 저장값을 지운다.
 */
export function usePanelWidths(wide: boolean) {
  const [stored, setStored] = useState<PanelWidths | null>(load);
  const viewport = useViewportWidth();

  useEffect(() => {
    save(stored);
  }, [stored]);

  const widths = fit(stored ?? defaultPanelWidths(wide), viewport);

  const resize = useCallback(
    (side: keyof PanelWidths, px: number) => {
      setStored((prev) => {
        const current = fit(prev ?? defaultPanelWidths(wide), window.innerWidth);
        const other = side === 'left' ? current.right : current.left;
        const limit = PANEL_LIMITS[side];
        // 상한은 규칙의 최대와 "가운데를 CENTER_MIN 만큼 남긴 나머지" 중 작은 쪽
        const room = window.innerWidth - CENTER_MIN - other;
        const max = Math.max(limit.min, Math.min(limit.max, room));
        return { ...current, [side]: Math.round(clamp(px, limit.min, max)) };
      });
    },
    [wide],
  );

  const reset = useCallback(() => setStored(null), []);

  return { widths, resize, reset };
}

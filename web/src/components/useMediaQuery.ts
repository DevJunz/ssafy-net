import { useCallback, useSyncExternalStore } from 'react';

/** 화면 폭 조건이 맞는지. 창 크기가 바뀌면 다시 렌더된다. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * 그래프를 놓을 수 없는 폭. 레일(232) + 패널(372)만으로 600px이 넘는다.
 * 이 아래에서는 그래프 대신 안내를 보여준다(docs/06 §5 — 그래프는 PC 전용).
 */
export const GRAPH_MIN_WIDTH_QUERY = '(min-width: 900px)';

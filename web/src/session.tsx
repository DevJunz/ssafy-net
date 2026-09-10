import type { FeatureFlagMap, ParameterMap, SelfUser } from '@ssafy-net/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api/client';

interface SessionValue {
  me: SelfUser | null;
  loading: boolean;
  reload: () => Promise<void>;
  /**
   * 기능 플래그(`GET /api/parameters`, 비로그인). Network 탭은 `network_enabled` 가 켜져야 보인다(D-75).
   * 운영자가 `/ops` 에서 스위치를 켜면 `reloadFeatures()` 로 새로 받아 새로고침 없이 탭이 나타난다(D-78).
   */
  features: FeatureFlagMap | null;
  reloadFeatures: () => Promise<void>;
}

const SessionContext = createContext<SessionValue>({
  me: null,
  loading: true,
  reload: async () => {},
  features: null,
  reloadFeatures: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<SelfUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState<FeatureFlagMap | null>(null);

  const reload = useCallback(async () => {
    try {
      setMe(await api.get<SelfUser>('/me'));
    } catch {
      // 401이면 비로그인이다. 오류가 아니라 상태다.
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadFeatures = useCallback(async () => {
    try {
      const result = await api.get<{ parameters: ParameterMap; features: FeatureFlagMap }>('/parameters');
      setFeatures(result.features);
    } catch {
      // 못 받으면 그대로 둔다. 플래그가 없으면 Network 탭이 안 보일 뿐이다.
    }
  }, []);

  useEffect(() => {
    void reload();
    void reloadFeatures();
  }, [reload, reloadFeatures]);

  return (
    <SessionContext.Provider value={{ me, loading, reload, features, reloadFeatures }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);

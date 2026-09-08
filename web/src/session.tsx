import type { SelfUser } from '@ssafy-net/shared';
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
}

const SessionContext = createContext<SessionValue>({
  me: null,
  loading: true,
  reload: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<SelfUser | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <SessionContext.Provider value={{ me, loading, reload }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);

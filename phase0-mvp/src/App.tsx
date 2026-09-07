import { useCallback, useEffect, useMemo, useState } from 'react';
import InterestGraph from './components/InterestGraph';
import SidePanel from './components/SidePanel';
import { ME_ID, networkSuggestions, posts as initialPosts, type Post } from './data/mock';
import { similarPeople, userById, type GraphLink, type GraphNode, type Mode, endpointId } from './lib/graph';

export default function App() {
  const [mode, setMode] = useState<Mode>({ type: 'explore' });
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const similarIds = useMemo(() => new Set(similarPeople(ME_ID).map((s) => s.userId)), []);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (node.kind === 'interest') {
        setMode({ type: 'interest', id: node.id });
        return;
      }
      // Similar 모드에서 비슷한 사람을 클릭하면 모드를 유지한 채 그 사람의 edge를 강조
      if (mode.type === 'similar' && similarIds.has(node.id)) {
        setMode({ type: 'similar', focusId: node.id });
        return;
      }
      setMode({ type: 'person', id: node.id });
    },
    [mode.type, similarIds],
  );

  const handleLinkClick = useCallback((link: GraphLink) => {
    if (link.kind === 'similar') {
      const other = [endpointId(link.source), endpointId(link.target)].find((id) => id !== ME_ID);
      if (other) setMode({ type: 'similar', focusId: other });
    }
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setMode((m) => (m.type === 'similar' && m.focusId ? { type: 'similar' } : { type: 'explore' }));
  }, []);

  const requestConnect = (id: string) => {
    setRequested((prev) => new Set(prev).add(id));
    setToast(`${userById.get(id)?.name}님에게 연결 요청을 보냈습니다.`);
  };

  const addPost = (interestId: string, content: string) => {
    setPosts((prev) => [
      { id: `p-local-${Date.now()}`, interestId, userId: ME_ID, content, createdAt: '방금' },
      ...prev,
    ]);
    setToast('글을 올렸습니다. (Mock)');
  };

  const modeLabel =
    mode.type === 'explore'
      ? '전체 탐색'
      : mode.type === 'person'
        ? `사람: ${userById.get(mode.id)?.name}`
        : mode.type === 'interest'
          ? '관심사 Focus'
          : mode.type === 'similar'
            ? '나와 비슷한 사람'
            : '추천 네트워크';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Interest Network <span className="tag">Phase 0 MVP</span>
        </div>
        <nav className="modes">
          <button
            className={`btn ${mode.type === 'explore' ? 'active' : ''}`}
            onClick={() => setMode({ type: 'explore' })}
          >
            전체 보기
          </button>
          <button
            className={`btn ${mode.type === 'similar' ? 'active' : ''}`}
            onClick={() => setMode({ type: 'similar' })}
          >
            나와 비슷한 사람 보기
          </button>
          {networkSuggestions.map((n, idx) => (
            <button
              key={n.id}
              className={`btn ${mode.type === 'network' && mode.id === n.id ? 'active' : ''}`}
              onClick={() => setMode({ type: 'network', id: n.id })}
            >
              네트워크 {idx + 1}
            </button>
          ))}
        </nav>
        <div className="mode-label">{modeLabel}</div>
      </header>

      <main className="main">
        <InterestGraph
          mode={mode}
          onNodeClick={handleNodeClick}
          onLinkClick={handleLinkClick}
          onBackgroundClick={handleBackgroundClick}
        />
        <aside className="side">
          <SidePanel
            mode={mode}
            posts={posts}
            requested={requested}
            onSelectPerson={(id) => setMode({ type: 'person', id })}
            onSelectInterest={(id) => setMode({ type: 'interest', id })}
            onShowSimilar={() => setMode({ type: 'similar' })}
            onShowNetwork={(id) => setMode({ type: 'network', id })}
            onFocusSimilar={(id) => setMode({ type: 'similar', focusId: id })}
            onRequestConnect={requestConnect}
            onAddPost={addPost}
          />
        </aside>
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

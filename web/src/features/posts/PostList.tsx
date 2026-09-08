import type { PostSummary } from '@ssafy-net/shared';
import { useState } from 'react';
import { api, RequestFailed } from '../../api/client';

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

/**
 * 관심사의 글 (docs/11 §4).
 *
 * 댓글도 좋아요도 없다. **글의 유일한 출구는 작성자 프로필**이고,
 * 거기서 연결 요청으로 이어진다(D-46). 이 이동 비율이 H8의 판단선이다.
 */
export function PostList({
  posts,
  onSelectAuthor,
}: {
  posts: PostSummary[];
  onSelectAuthor: (userId: string) => void;
}) {
  if (posts.length === 0) {
    return (
      <div className="notice">
        아직 글이 없습니다. 이 관심사로 이야기하고 싶은 것을 남겨보세요.
      </div>
    );
  }

  return (
    <div className="list">
      {posts.map((post) => (
        <div key={post.id} className="post">
          <div className="post-body">{post.content}</div>
          <div className="post-foot">
            {post.authorId ? (
              <button
                type="button"
                className="link"
                onClick={() => onSelectAuthor(post.authorId!)}
              >
                작성자 보기
              </button>
            ) : (
              <span />
            )}
            <span>{timeAgo(post.createdAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 글 작성 (docs/06 §3.12).
 * 관심사를 가진 사람만 쓸 수 있다(FR-6.1). 길이는 [P-17] 300자.
 */
export function PostComposer({
  interestId,
  interestName,
  onPosted,
}: {
  interestId: string;
  interestName: string;
  onPosted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const limit = 300;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/posts', { interestId, content: content.trim() });
      setContent('');
      setOpen(false);
      onPosted();
    } catch (e) {
      setError(e instanceof RequestFailed ? e.message : '남기지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        {interestName}에 글 남기기
      </button>
    );
  }

  return (
    <div className="stack">
      <textarea
        value={content}
        maxLength={limit}
        onChange={(event) => setContent(event.target.value)}
        placeholder="이 관심사로 어떤 이야기를 나누고 싶은지 남겨보세요."
        style={{ minHeight: 84 }}
      />
      {/* 용도를 매번 상기시킨다. 커뮤니티가 아니다(docs/11 §2) */}
      <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
        댓글은 없고, 관심 있는 사람이 프로필로 찾아옵니다. {content.length}/{limit}
      </p>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={!content.trim() || busy}
          onClick={() => void submit()}
        >
          남기기
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          취소
        </button>
      </div>
    </div>
  );
}

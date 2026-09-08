import type { PostSummary } from '@ssafy-net/shared';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';

/** 내가 쓴 글 관리 (docs/06 §3.10). 수정은 없다. 삭제 후 재작성한다(docs/11 §3). */
export function MyPosts() {
  const [posts, setPosts] = useState<PostSummary[]>([]);

  const reload = useCallback(async () => {
    setPosts(await api.get<PostSummary[]>('/me/posts'));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (posts.length === 0) {
    return (
      <div className="notice">
        아직 쓴 글이 없습니다. 관심사 상세에서 남길 수 있습니다.
      </div>
    );
  }

  return (
    <div className="list">
      {posts.map((post) => (
        <div key={post.id} className="post">
          <div className="post-body">{post.content}</div>
          <div className="post-foot">
            <span>#{post.interestName}</span>
            <button
              type="button"
              className="link"
              onClick={async () => {
                await api.del(`/posts/${post.id}`);
                await reload();
              }}
            >
              삭제
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

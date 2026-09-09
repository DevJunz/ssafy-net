import type { PostSummary } from '@ssafy-net/shared';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '../../api/client';
import { Notice } from '../../components/primitives';
import { PostBody, PostCard, PostFoot } from './PostList';

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
    return <Notice>아직 쓴 글이 없습니다. 관심사 상세에서 남길 수 있습니다.</Notice>;
  }

  return (
    <div className="flex flex-col gap-1">
      {posts.map((post) => (
        <PostCard key={post.id}>
          <PostBody>{post.content}</PostBody>
          <PostFoot>
            <span>#{post.interestName}</span>
            <Button
              type="button"
              variant="link"
              size="xs"
              className="h-auto p-0 text-xs underline underline-offset-2"
              onClick={async () => {
                await api.del(`/posts/${post.id}`);
                await reload();
              }}
            >
              삭제
            </Button>
          </PostFoot>
        </PostCard>
      ))}
    </div>
  );
}

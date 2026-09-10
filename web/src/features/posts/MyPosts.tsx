import type { PostSummary } from '@ssafy-net/shared';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '../../api/client';
import { Notice } from '../../components/primitives';
import { OverlayActions, ResponsiveDialog } from '../../components/ResponsiveDialog';
import { PostBody, PostCard, PostFoot } from './PostList';

/** 내가 쓴 글 관리 (docs/06 §3.10). 수정은 없다. 삭제 후 재작성한다(docs/11 §3). */
export function MyPosts() {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  // 삭제는 되돌릴 수 없다. 누른 즉시 지우지 않고 한 번 묻는다.
  const [confirming, setConfirming] = useState<PostSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setPosts(await api.get<PostSummary[]>('/me/posts'));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const remove = async (post: PostSummary) => {
    setBusy(true);
    try {
      await api.del(`/posts/${post.id}`);
      setConfirming(null);
      await reload();
    } finally {
      setBusy(false);
    }
  };

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
              onClick={() => setConfirming(post)}
            >
              삭제
            </Button>
          </PostFoot>
        </PostCard>
      ))}

      {confirming && (
        <ResponsiveDialog
          title="이 글을 삭제할까요?"
          description="삭제한 글은 되돌릴 수 없습니다. 수정은 없으니 필요하면 다시 써주세요."
          onClose={() => (busy ? undefined : setConfirming(null))}
        >
          <PostCard className="mt-4 bg-secondary">
            <PostBody className="line-clamp-4">{confirming.content}</PostBody>
            <PostFoot>
              <span>#{confirming.interestName}</span>
            </PostFoot>
          </PostCard>
          <OverlayActions>
            <Button
              type="button"
              variant="destructive"
              className="flex-1"
              disabled={busy}
              onClick={() => void remove(confirming)}
            >
              삭제
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirming(null)}
            >
              취소
            </Button>
          </OverlayActions>
        </ResponsiveDialog>
      )}
    </div>
  );
}

import type { PostSummary } from '@ssafy-net/shared';
import { useState, type ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { api, RequestFailed } from '../../api/client';
import { ErrorText, Muted, Notice } from '../../components/primitives';

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

/** 글 한 장. 관심사 패널·사람 패널·내 프로필이 같은 모양을 쓴다. */
export function PostCard({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-lg border bg-card px-[13px] py-3', className)}
      {...props}
    />
  );
}

export function PostBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('text-[13.5px] leading-relaxed whitespace-pre-wrap', className)}
      {...props}
    />
  );
}

export function PostFoot({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mt-2 flex items-center justify-between text-xs text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
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
      <Notice>아직 글이 없습니다. 이 관심사로 이야기하고 싶은 것을 남겨보세요.</Notice>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {posts.map((post) => (
        <PostCard key={post.id}>
          <PostBody>{post.content}</PostBody>
          <PostFoot>
            {post.authorId ? (
              <Button
                type="button"
                variant="link"
                size="xs"
                className="h-auto p-0 text-xs underline underline-offset-2"
                onClick={() => onSelectAuthor(post.authorId!)}
              >
                작성자 보기
              </Button>
            ) : (
              <span />
            )}
            <span>{timeAgo(post.createdAt)}</span>
          </PostFoot>
        </PostCard>
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
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        {interestName}에 글 남기기
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Textarea
        value={content}
        maxLength={limit}
        onChange={(event) => setContent(event.target.value)}
        placeholder="이 관심사로 어떤 이야기를 나누고 싶은지 남겨보세요."
        className="min-h-[84px] bg-card"
      />
      {/* 용도를 매번 상기시킨다. 커뮤니티가 아니다(docs/11 §2) */}
      <Muted className="-mt-1.5 text-xs">
        댓글은 없고, 관심 있는 사람이 프로필로 찾아옵니다. {content.length}/{limit}
      </Muted>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          disabled={!content.trim() || busy}
          onClick={() => void submit()}
        >
          남기기
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          취소
        </Button>
      </div>
    </div>
  );
}

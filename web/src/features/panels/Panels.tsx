import type {
  ConnectedUser,
  GraphResponse,
  InterestDetail,
  PublicUser,
  SimilarPeopleResponse,
} from '@ssafy-net/shared';
import type { ComponentProps, ReactNode } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  Chip,
  Chips,
  ChipTag,
  Muted,
  Notice,
  Tag,
} from '../../components/primitives';
import { categoryVar, INTEREST_VAR, ME_VAR, PERSON_VAR } from '../graph/encoding';
import { PostBody, PostCard, PostComposer, PostFoot, PostList } from '../posts/PostList';
import { PersonRow } from './PersonRow';

/** 오른쪽 패널의 틀. 그래프 옆에서 스크롤된다. */
function Panel({ children }: { children: ReactNode }) {
  return (
    <ScrollArea className="h-full border-l bg-card">
      <div className="px-4 pt-5 pb-9 wide:px-5 wide:pt-[22px] wide:pb-10">{children}</div>
    </ScrollArea>
  );
}

function PanelTitle({ className, ...props }: ComponentProps<'h2'>) {
  return (
    <h2
      className={cn('mb-[3px] flex flex-wrap items-center gap-2 text-lg', className)}
      {...props}
    />
  );
}

function PanelSection({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-[22px]', className)} {...props} />;
}

/**
 * 범례 한 항목. 캔버스와 같은 색과 **같은 모양**을 쓴다(encoding.ts 의 규칙).
 *   사람 = 원, 나 = 테두리 두 겹의 원, 관심사 = 모서리 둥근 사각형, 인접 관심사 = 속이 빈 사각형
 */
function LegendDot({
  color,
  shape = 'circle',
  hollow,
}: {
  color?: string;
  shape?: 'circle' | 'square' | 'me';
  hollow?: boolean;
}) {
  return (
    <i
      className={cn(
        'inline-block size-2.5',
        shape === 'square' ? 'rounded-[3px]' : 'rounded-full',
        shape === 'me' && 'size-3 ring-2 ring-[var(--graph-me)] ring-offset-1 ring-offset-[var(--graph-bg)]',
        // 인접 관심사는 속이 빈 것이다(docs/06 §2). 캔버스의 표현과 같게
        hollow && 'border-[1.5px] border-dashed border-muted-foreground bg-[var(--graph-bg)]',
      )}
      style={color ? { background: color } : undefined}
    />
  );
}

function Legend({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground [&>span]:inline-flex [&>span]:items-center [&>span]:gap-[5px]">
      {children}
    </div>
  );
}

/** 패널: 기본 (docs/05 §3.3) — 무엇을 할지 알려주고 추천 진입점을 준다. */
export function BasePanel({
  graph,
  anchorNames,
  similarTotal,
  onSimilarMode,
}: {
  graph: GraphResponse | null;
  /** 앵커가 관심사일 때 그 이름들. 비어 있으면 내 그래프다. */
  anchorNames: string[];
  similarTotal: number | null;
  onSimilarMode: () => void;
}) {
  const categories = new Map<string, string>();
  let peopleInGraph = 0;
  graph?.nodes.forEach((node) => {
    if (node.kind === 'INTEREST') categories.set(node.categoryId, node.name);
    if (node.kind === 'PERSON') peopleInGraph += 1;
  });
  const peopleTotal = peopleInGraph + (graph?.truncated.people ?? 0);

  return (
    <Panel>
      {anchorNames.length === 0 ? (
        <>
          <PanelTitle>내 그래프</PanelTitle>
          <Muted>사람이나 관심사를 눌러보세요.</Muted>
        </>
      ) : (
        <>
          <PanelTitle>{anchorNames.map((name) => `#${name}`).join(' · ')}</PanelTitle>
          <Muted>
            {anchorNames.length === 1
              ? `이 관심사를 가진 사람 ${peopleTotal}명`
              : `${anchorNames.length}개를 모두 가진 사람 ${peopleTotal}명`}
            {graph && peopleTotal === 0 && ' · 다른 관심사를 빼 보세요.'}
          </Muted>
        </>
      )}

      {anchorNames.length === 0 && (
        <PanelSection>
          <Button type="button" onClick={onSimilarMode}>
            나와 비슷한 사람 보기
            {similarTotal !== null && ` (${similarTotal}명)`}
          </Button>
        </PanelSection>
      )}

      {anchorNames.length > 0 && (
        <PanelSection>
          <Notice>
            관심사 노드를 <b className="font-semibold text-foreground">Shift+클릭</b>하면 그
            관심사도 가진 사람만 남깁니다. 위쪽 칩의 ×로 하나씩 뺄 수 있습니다.
          </Notice>
        </PanelSection>
      )}

      <PanelSection>
        <Legend>
          <span><LegendDot color={ME_VAR} shape="me" /> 나</span>
          <span><LegendDot color={PERSON_VAR} /> 사람</span>
          <span><LegendDot color={INTEREST_VAR} shape="square" /> 관심사</span>
          <span><LegendDot shape="square" hollow /> 인접 관심사</span>
        </Legend>
      </PanelSection>

      {categories.size > 0 && (
        <PanelSection>
          <Legend>
            {[...categories.keys()].map((id) => (
              <span key={id}>
                <LegendDot color={categoryVar(id)} shape="square" />
                {/* Category 이름은 관심사 노드에서 알 수 없으므로 색만 보여준다 */}
              </span>
            ))}
          </Legend>
        </PanelSection>
      )}

      {graph && (graph.truncated.people > 0 || graph.truncated.interests > 0) && (
        <PanelSection>
          <Notice>
            나와 공통 관심사가 많은 순으로 보여줍니다.
            {graph.truncated.people > 0 && ` 사람 ${graph.truncated.people}명 더 있음.`}
            {graph.truncated.interests > 0 && ` 관심사 ${graph.truncated.interests}개 더 있음.`}
          </Notice>
        </PanelSection>
      )}
    </Panel>
  );
}

/** 패널: Interest 상세 (docs/06 §3.3) */
export function InterestPanel({
  detail,
  anchorCount,
  inAnchor,
  onRecenter,
  onAddToAnchor,
  onRemoveFromAnchor,
  onSelectPerson,
  onAddToMine,
  onReload,
}: {
  detail: InterestDetail;
  /** 지금 앵커인 관심사 수. 0이면 내 그래프다. */
  anchorCount: number;
  /** 이 관심사가 앵커에 들어 있는지 */
  inAnchor: boolean;
  onRecenter: () => void;
  /** 앵커에 더해 "함께 가진 사람만" 남긴다(D-76) */
  onAddToAnchor: () => void;
  onRemoveFromAnchor: () => void;
  onSelectPerson: (userId: string) => void;
  onAddToMine: () => void;
  onReload: () => void;
}) {
  return (
    <Panel>
      <PanelTitle>
        {detail.name}
        {detail.mine && <Tag tone="state">내 관심사</Tag>}
        {inAnchor && anchorCount > 1 && <Tag tone="state">함께 보는 중</Tag>}
      </PanelTitle>
      <Muted>
        {detail.categoryName} · {detail.holderCount}명
      </Muted>

      <PanelSection className="flex flex-wrap items-center gap-2">
        {anchorCount === 0 && (
          <Button type="button" variant="outline" onClick={onRecenter}>
            이 관심사를 중심으로 보기
          </Button>
        )}
        {anchorCount > 0 && !inAnchor && (
          <>
            <Button type="button" onClick={onAddToAnchor}>
              함께 가진 사람만 보기
            </Button>
            <Button type="button" variant="outline" onClick={onRecenter}>
              이 관심사만 중심으로
            </Button>
          </>
        )}
        {inAnchor && anchorCount > 1 && (
          <Button type="button" variant="outline" onClick={onRemoveFromAnchor}>
            함께 보기에서 빼기
          </Button>
        )}
        {!detail.mine && (
          <Button type="button" variant="outline" onClick={onAddToMine}>
            내 관심사에 추가
          </Button>
        )}
      </PanelSection>

      <PanelSection>
        <Muted className="mb-2">
          나와 공통 관심사가 많은 순 · {detail.peopleTotal}명
        </Muted>
        {detail.people.length === 0 ? (
          <Notice>아직 이 관심사를 가진 다른 사람이 없습니다.</Notice>
        ) : (
          <div className="flex flex-col gap-1">
            {detail.people.map((item) => (
              <PersonRow
                key={item.user.id}
                user={item.user}
                commonCount={item.commonCount}
                onClick={() => onSelectPerson(item.user.id)}
              />
            ))}
          </div>
        )}
        {detail.peopleTotal > detail.people.length && (
          <Muted className="mt-2">
            {detail.peopleTotal - detail.people.length}명 더 있음
          </Muted>
        )}
      </PanelSection>

      <Separator className="mt-[22px]" />

      {/* 글은 "이 관심사에서 누가 활동하는지"를 드러내는 장치다(docs/11 §1) */}
      <PanelSection>
        <Muted className="mb-2">최근 글</Muted>
        <PostList posts={detail.posts} onSelectAuthor={onSelectPerson} />
        <div className="mt-2.5">
          {detail.canPost ? (
            <PostComposer
              interestId={detail.id}
              interestName={detail.name}
              onPosted={onReload}
            />
          ) : (
            <Muted className="text-xs">이 관심사를 추가하면 글을 남길 수 있습니다.</Muted>
          )}
        </div>
      </PanelSection>
    </Panel>
  );
}

/** 패널: Person Profile (docs/06 §3.4) */
export function PersonPanel({
  person,
  onSelectInterest,
  onRequest,
  onOpenConnection,
}: {
  person: PublicUser | ConnectedUser;
  onSelectInterest: (interestId: string) => void;
  onRequest: () => void;
  onOpenConnection: () => void;
}) {
  const common = person.interests.filter((i) => i.isCommon);
  const others = person.interests.filter((i) => !i.isCommon);
  const realName = (person as ConnectedUser).realName;

  return (
    <Panel>
      <div className="flex items-start gap-3">
        <Avatar className="size-10 flex-none">
          <AvatarFallback className="bg-accent text-sm font-semibold text-accent-foreground">
            {person.displayName.slice(0, 1)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <PanelTitle>
            {person.displayName}
            {person.displayNameType === 'REAL' && <Tag tone="real">실명</Tag>}
          </PanelTitle>
          {/* 실명은 연결됨 상태에서만 응답에 들어온다(docs/12 §1) */}
          {realName && <Muted>{realName}</Muted>}
        </div>
      </div>

      {/* 본인이 적어 둔 한 줄(D-85). 표시명 바로 아래, 관심사보다 앞에 */}
      {person.profileMessage && (
        <p className="mt-3 mb-0 rounded-lg bg-secondary px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">
          {person.profileMessage}
        </p>
      )}

      <PanelSection>
        <Muted className="mb-2">
          공통 관심사 {common.length}개 / 상대 관심사 {person.interests.length}개
        </Muted>
        <Chips>
          {common.map((interest) => (
            <Chip
              key={interest.id}
              selected
              onClick={() => onSelectInterest(interest.id)}
            >
              {interest.name}
            </Chip>
          ))}
          {others.map((interest) => (
            <Chip key={interest.id} onClick={() => onSelectInterest(interest.id)}>
              {interest.name}
            </Chip>
          ))}
        </Chips>
      </PanelSection>

      {person.recentPosts && person.recentPosts.length > 0 && (
        <PanelSection>
          <Muted className="mb-2">최근 글</Muted>
          <div className="flex flex-col gap-1">
            {person.recentPosts.map((post) => (
              <PostCard key={post.id}>
                <PostBody>{post.content}</PostBody>
                <PostFoot>
                  <span>#{post.interestName}</span>
                </PostFoot>
              </PostCard>
            ))}
          </div>
        </PanelSection>
      )}

      <PanelSection>
        <PersonAction
          person={person}
          onRequest={onRequest}
          onOpenConnection={onOpenConnection}
        />
      </PanelSection>
    </Panel>
  );
}

/** 연결 상태에 따라 **가능한 행동 하나만** 보여준다(docs/06 §3.4). */
function PersonAction({
  person,
  onRequest,
  onOpenConnection,
}: {
  person: PublicUser;
  onRequest: () => void;
  onOpenConnection: () => void;
}) {
  switch (person.relation.status) {
    case 'SELF':
      return <Notice>내 프로필입니다. 관심사는 내 프로필에서 수정합니다.</Notice>;
    case 'CONNECTED':
      return (
        <Button type="button" onClick={onOpenConnection}>
          연결됨 · 성립 화면 열기
        </Button>
      );
    case 'REQUEST_SENT':
      return (
        <Button type="button" variant="outline" disabled>
          요청 보냄 · 응답 대기
        </Button>
      );
    case 'REQUEST_RECEIVED':
      return (
        <Notice>
          이 사람이 먼저 요청했습니다. 연결 화면에서 수락하거나 거절할 수 있습니다.
        </Notice>
      );
    case 'REJECTED':
      // 거절은 바로 보이고, 곧바로 다시 요청할 수 있다(D-83). 표시를 지우는 것은 연결 화면에서 한다.
      return (
        <div className="flex flex-col gap-2">
          <Notice className="border-destructive/20">
            이 사람이 이전 요청을 거절했습니다. 다시 요청할 수 있습니다.
          </Notice>
          <Button type="button" variant="outline" onClick={onRequest}>
            다시 요청
          </Button>
        </div>
      );
    case 'NO_RESPONSE':
      // 같은 날 취소한 요청만 내일까지 기다린다(docs/09 §8). 만료는 바로 다시 요청할 수 있다(D-83).
      if (person.relation.reRequestableAt) {
        return (
          <Button type="button" variant="outline" disabled className="h-auto whitespace-normal">
            오늘 취소한 요청 · 내일 다시 요청 가능
          </Button>
        );
      }
      return (
        <div className="flex flex-col gap-2">
          <Notice>이전 요청에 기한 안에 응답이 없었습니다. 다시 요청할 수 있습니다.</Notice>
          <Button type="button" variant="outline" onClick={onRequest}>
            다시 요청
          </Button>
        </div>
      );
    default:
      return (
        <Button type="button" onClick={onRequest}>
          연결 요청
        </Button>
      );
  }
}

/** 패널: Similar People (docs/06 §3.5) */
export function SimilarPanel({
  data,
  onSelectPerson,
  onClose,
}: {
  data: SimilarPeopleResponse;
  onSelectPerson: (userId: string) => void;
  onClose: () => void;
}) {
  return (
    <Panel>
      <PanelTitle>나와 비슷한 사람 {data.total}명</PanelTitle>
      {/* 정렬 기준을 서버 문장 그대로 보여준다(docs/13 원칙 4) */}
      <Muted>
        공통 관심사 {data.criterion.minCommon}개 이상 · {data.criterion.sortBy}
      </Muted>

      <PanelSection>
        <Notice>선은 관심사가 겹친다는 뜻이며 아는 사이가 아닙니다.</Notice>
      </PanelSection>

      {data.items.length === 0 ? (
        <PanelSection>
          <Notice>
            아직 공통 관심사가 {data.criterion.minCommon}개 이상인 사람이 없습니다.
            관심사를 더 고르면 비슷한 사람을 더 찾을 수 있습니다.
          </Notice>
        </PanelSection>
      ) : (
        <PanelSection className="flex flex-col gap-1">
          {data.items.map((item) => (
            <div key={item.user.id}>
              <PersonRow
                user={item.user}
                commonCount={item.commonCount}
                onClick={() => onSelectPerson(item.user.id)}
              />
              {/* 이유는 완전해야 한다 — 이름을 전부 보여준다(원칙 3) */}
              <Chips className="mt-1 mb-2 ml-2.5">
                {item.commonInterests.map((interest) => (
                  <ChipTag key={interest.id} selected>
                    {interest.name}
                  </ChipTag>
                ))}
              </Chips>
            </div>
          ))}
        </PanelSection>
      )}

      <PanelSection>
        <Button type="button" variant="outline" onClick={onClose}>
          모드 끄기
        </Button>
      </PanelSection>
    </Panel>
  );
}
